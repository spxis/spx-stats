"""Decode the user tables of a SQL Server 2000 .bak without SQL Server.

Reads the catalog (sysobjects id 1, syscolumns id 3) from the backup's own
pages, then decodes every data page of the tables asked for.
  decode.py <file.bak> --list
  decode.py <file.bak> --out <folder> [table ...]
writes <folder>/<table>.tsv (header row, \\N for null, tab/newline escaped)."""
import argparse, collections, datetime, decimal, os, struct, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pages as P

EPOCH = datetime.datetime(1900, 1, 1)
UNREADABLE = collections.Counter()


def catalog(pagelist):
    cols = collections.defaultdict(list)
    objs = {}
    for p in pagelist:
        h = P.header(p)
        if h["type"] != 1:
            continue
        for pg, off in P.records(p):
            r = P.split_record(pg, off)
            if not r:
                continue
            fixed, nulls, ncols, var = r
            if h["obj_id"] == 3 and len(fixed) >= 34 and var:
                tid, xtype = struct.unpack_from('<iB', fixed, 0)
                length, = struct.unpack_from('<h', fixed, 8)
                xprec, xscale = fixed[10], fixed[11]
                colid, xoffset = struct.unpack_from('<hh', fixed, 12)
                bitpos = fixed[16]
                cols[tid].append(dict(name=var[0].decode('utf-16-le', 'replace'), xtype=xtype, length=length,
                                      prec=xprec, scale=xscale, colid=colid, xoffset=xoffset, bitpos=bitpos))
            elif h["obj_id"] == 1 and len(fixed) >= 6 and var:
                oid, = struct.unpack_from('<i', fixed, 0)
                xt = fixed[4:6].decode('latin-1')
                objs[oid] = (var[0].decode('utf-16-le', 'replace'), xt)
    for tid in cols:  # a column listed twice (two page versions) keeps one copy
        seen = {}
        for c in cols[tid]:
            seen[c["colid"]] = c
        cols[tid] = sorted(seen.values(), key=lambda c: c["colid"])
    return objs, cols


def value(c, fixed, var, nulls):
    if c["xoffset"] == 0:              # a computed column: not stored in the row
        return None
    if P.is_null(nulls, c["colid"]):
        return None
    t = c["xtype"]
    if c["xoffset"] >= 0:
        o = c["xoffset"] - 4
        b = fixed[o:o + max(c["length"], 1)]
    else:
        i = -c["xoffset"] - 1
        if i >= len(var):
            return None
        b = var[i]
    if t == 104:                       # bit
        return int(bool(fixed[c["xoffset"] - 4] & (1 << c["bitpos"])))
    if t == 48: return b[0]
    if t == 52: return struct.unpack('<h', b[:2])[0]
    if t == 56: return struct.unpack('<i', b[:4])[0]
    if t == 127: return struct.unpack('<q', b[:8])[0]
    if t == 59: return struct.unpack('<f', b[:4])[0]
    if t == 62: return struct.unpack('<d', b[:8])[0]
    if t == 60:                        # money: high int, low uint, in 1/10000
        hi, lo = struct.unpack('<iI', b[:8]); return decimal.Decimal((hi << 32) + lo) / 10000
    if t == 122: return decimal.Decimal(struct.unpack('<i', b[:4])[0]) / 10000
    if t in (106, 108):                # decimal/numeric: sign byte then little-endian integer
        n = int.from_bytes(b[1:c["length"]], 'little')
        v = decimal.Decimal(n).scaleb(-c["scale"])
        return v if b[0] == 1 else -v
    if t == 61:                        # datetime: 1/300 s ticks since midnight, then days since 1900
        ticks, days = struct.unpack('<Ii', b[:8])
        return (EPOCH + datetime.timedelta(days=days, milliseconds=round(ticks * 10 / 3))).isoformat(sep=' ', timespec='milliseconds')
    if t == 58:                        # smalldatetime: minutes since midnight, then days since 1900
        mins, days = struct.unpack('<HH', b[:4])
        return (EPOCH + datetime.timedelta(days=days, minutes=mins)).isoformat(sep=' ')
    if t in (175, 167):                # char keeps its padding, as SQL Server returns it
        if any(x < 0x20 and x not in (9, 10, 13) for x in b):
            UNREADABLE[c["name"]] += 1  # an older stored form (a pointer, not text): left null
            return None
        return b.decode('cp1252', 'replace')
    if t in (239, 231): return b.decode('utf-16-le', 'replace')
    if t == 36:
        import uuid; return str(uuid.UUID(bytes_le=bytes(b[:16])))
    if t in (35, 99, 34):              # text/ntext/image are off-row; their pointer is not followed yet
        return "\\T"
    return b.hex()


def esc(v):
    if v is None:
        return "\\N"
    s = str(v)
    return s.replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("bak"); ap.add_argument("--list", action="store_true"); ap.add_argument("--out")
    ap.add_argument("--raw", help="write <dir>/<table>.raw and .cols in the bcp form load_backup.sh reads")
    ap.add_argument("--map", help="tablemap.tsv: which tables, and their columns in order")
    ap.add_argument("--columns", action="store_true", help="print the tables' columns in the form of scripts/spx/columns.tsv")
    ap.add_argument("tables", nargs="*")
    a = ap.parse_args()
    data = open(a.bak, 'rb').read()
    latest = {}
    for _, p in P.pages(data):        # the last copy of a page in the file wins
        latest[P.header(p)["page_id"]] = p
    pl = list(P.live(latest).values())
    objs, cols = catalog(pl)
    users = {oid: n for oid, (n, xt) in objs.items() if xt == 'U '}
    if a.list:
        counts = collections.Counter(P.header(p)["obj_id"] for p in pl if P.header(p)["type"] == 1)
        for oid, n in sorted(users.items(), key=lambda x: x[1].lower()):
            print(f"{n}\t{len(cols.get(oid, []))} columns\t{counts.get(oid, 0)} pages")
        return
    if a.columns:
        return write_columns(a, users, cols)
    if a.raw:
        return write_raw(a, pl, users, cols)
    want = {t.lower() for t in a.tables}
    os.makedirs(a.out, exist_ok=True)
    byname = {n.lower(): oid for oid, n in users.items()}
    for t in sorted(want or byname):
        oid = byname.get(t)
        if oid is None:
            print(f"missing {t}", file=sys.stderr); continue
        cs = cols[oid]; n = 0
        with open(os.path.join(a.out, users[oid] + ".tsv"), "w", encoding="utf-8") as f:
            f.write("\t".join(c["name"] for c in cs) + "\n")
            for p in pl:
                h = P.header(p)
                if h["obj_id"] != oid or h["type"] != 1:
                    continue
                for pg, off in P.records(p):
                    r = P.split_record(pg, off)
                    if not r:
                        continue
                    fixed, nulls, ncols, var = r
                    try:
                        f.write("\t".join(esc(value(c, fixed, var, nulls)) for c in cs) + "\n"); n += 1
                    except (struct.error, IndexError, ValueError, OverflowError):
                        print(f"{users[oid]}: undecodable row on page {h['page_id']}", file=sys.stderr)
        print(f"{users[oid]}\t{n}")


TYPE_NAMES = {48: "tinyint", 52: "smallint", 56: "int", 127: "bigint", 104: "bit", 59: "real", 62: "float",
              60: "money", 122: "smallmoney", 106: "decimal", 108: "numeric", 61: "datetime", 58: "smalldatetime",
              175: "char", 167: "varchar", 239: "nchar", 231: "nvarchar", 35: "text", 99: "ntext", 36: "uniqueidentifier"}


def write_columns(a, users, cols):
    byname = {n.lower(): oid for oid, n in users.items()}
    for t in a.tables:
        oid = byname[t.lower()]
        for c in cols[oid]:
            print("\t".join(map(str, [users[oid], c["name"], TYPE_NAMES.get(c["xtype"], "varbinary"), c["prec"],
                                        c["scale"], "YES", c["colid"], 0])))


def _future_decimal(r):
    m = r.get("FutureOddMoney")
    if m is None:
        return 0
    m = decimal.Decimal(m)
    return (1 + (decimal.Decimal(100) / abs(m) if m < 0 else m / 100)).quantize(decimal.Decimal("0.0001"))


# Computed columns of the sports tables, as their formulas in syscomments define them.
COMPUTED = {
    ("tblgamescores", "scoreisfinal"): lambda r: None if r.get("ScoreStatus") is None
        else int("FINAL" in r["ScoreStatus"].upper()),
    ("tblgamingfutureodds", "futureodddecimal"): _future_decimal,
}


def raw_value(v):
    """bcp's character form: NULL is empty, an empty string is a NUL byte."""
    if v is None:
        return ""
    if v == "":
        return "\x00"
    return str(v)


def row_counts(pl, cols):
    """rowcnt from sysindexes (id 2) for each table's heap or clustered index."""
    out = {}
    for p in pl:
        if P.header(p)["obj_id"] != 2 or P.header(p)["type"] != 1:
            continue
        for pg, off in P.records(p):
            r = P.split_record(pg, off)
            if not r:
                continue
            fixed, nulls, ncols, var = r
            v = {c["name"]: value(c, fixed, var, nulls) for c in cols[2] if c["name"] in ("id", "indid", "rowcnt")}
            if v.get("indid") in (0, 1):
                out[v["id"]] = v["rowcnt"]
    return out


def write_raw(a, pl, users, cols):
    expected = row_counts(pl, cols)
    os.makedirs(a.raw, exist_ok=True)
    byname = {n.lower(): oid for oid, n in users.items()}
    bypage = collections.defaultdict(list)
    for p in pl:
        h = P.header(p)
        if h["type"] == 1:
            bypage[h["obj_id"]].append(p)
    for line in open(a.map):
        src, _tgt, srccols = line.rstrip("\n").split("\t")[:3]
        oid = byname.get(src.lower())
        if oid is None:
            continue
        have = {c["name"].lower(): c for c in cols[oid]}
        cs = [have[c.lower()] for c in srccols.split("|") if c.lower() in have]
        n = bad = 0
        with open(os.path.join(a.raw, src + ".raw"), "w", encoding="utf-8") as f:
            for p in bypage.get(oid, []):
                for pg, off in P.records(p):
                    r = P.split_record(pg, off)
                    if not r:
                        continue
                    fixed, nulls, ncols, var = r
                    try:
                        row = {c["name"]: value(c, fixed, var, nulls) for c in cols[oid]}
                        for c in cs:
                            f_ = COMPUTED.get((src.lower(), c["name"].lower()))
                            if f_:
                                row[c["name"]] = f_(row)
                        vals = [raw_value(row[c["name"]]) for c in cs]
                    except (struct.error, IndexError, ValueError, OverflowError):
                        bad += 1; continue
                    f.write("~^~".join(vals) + "~#~\n"); n += 1
        with open(os.path.join(a.raw, src + ".cols"), "w") as f:
            f.write("\n".join(c["name"] for c in cs) + "\n")
        if UNREADABLE:
            print(f"{src}\tunreadable text left null: " + ", ".join(f"{k} {v}" for k, v in UNREADABLE.items()), file=sys.stderr)
            UNREADABLE.clear()
        exp = expected.get(oid)
        note = "" if exp is None or exp == n else f"\tSQL Server counted {exp}"
        print(f"{src}\t{n}" + (f"\t{bad} undecodable" if bad else "") + note)


if __name__ == "__main__":
    main()
