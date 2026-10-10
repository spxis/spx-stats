"""SPX's SQL Server INSERT scripts (e.g. InsertTableData.sql, March 2003) ->
<dir>/<table>.raw and .cols in the form load_backup.sh reads (SPX_RAW mode).
Only tables listed in the given tablemap are written; member tables never are.
Usage: sqlinsert_to_raw.py <script.sql> <out dir> <tablemap.tsv> [...]"""
import collections, datetime, os, re, sys

script, out = sys.argv[1], sys.argv[2]
keep, order = {}, {}
for tm in sys.argv[3:]:
    for line in open(tm):
        f = line.split("\t")
        keep[f[0].lower()] = f[0]
        order[f[0]] = f[2].split("|")      # the table map's column order, which load_backup.sh expects
INS = re.compile(r"^INSERT INTO \[?(\w+)\]? \((.*?)\) VALUES \((.*)\)\s*$", re.I)
DATE = re.compile(r"^([A-Z][a-z]{2}) +(\d{1,2}) (\d{4}) +(\d{1,2}):(\d{2})(AM|PM)$")


def values(s):
    """Split a VALUES list: N'..' / '..' strings (with '' escapes), NULL, numbers."""
    out, i = [], 0
    while i < len(s):
        c = s[i]
        if c in " ,":
            i += 1; continue
        if c in "Nn" and s[i + 1:i + 2] == "'":
            i += 1; c = "'"
        if c == "'":
            j, buf = i + 1, []
            while True:
                k = s.index("'", j)
                buf.append(s[j:k])
                if s[k + 1:k + 2] == "'":
                    buf.append("'"); j = k + 2
                else:
                    i = k + 1; break
            out.append("".join(buf))
        else:
            j = i
            while j < len(s) and s[j] != ",":
                j += 1
            tok = s[i:j].strip(); i = j
            out.append(None if tok.upper() == "NULL" else tok)
    return out


def fix(v):
    if v is None:
        return ""
    m = DATE.match(v)
    if m:
        mon, d, y, h, mi, ap = m.groups()
        h = int(h) % 12 + (12 if ap == "PM" else 0)
        v = datetime.datetime.strptime(f"{mon} {d} {y}", "%b %d %Y").replace(hour=h, minute=int(mi)).isoformat(sep=" ")
    return "\x00" if v == "" else v


rows = collections.defaultdict(list); cols = {}
for line in open(script, encoding="utf-8", errors="replace"):
    m = INS.match(line.strip())
    if not m or m.group(1).lower() not in keep:
        continue
    t = keep[m.group(1).lower()]
    cs = [c.strip(" []") for c in m.group(2).split(",")]
    vs = values(m.group(3))
    if len(vs) != len(cs):
        print(f"{t}: skipped a row with {len(vs)} values for {len(cs)} columns", file=sys.stderr); continue
    cols.setdefault(t, cs)
    rows[t].append([fix(v) for v in vs])
os.makedirs(out, exist_ok=True)
for t, rs in rows.items():
    pos = {c.lower(): i for i, c in enumerate(cols[t])}
    use = [c for c in order[t] if c.lower() in pos]
    with open(os.path.join(out, t + ".raw"), "w", encoding="utf-8") as f:
        for r in rs:
            f.write("~^~".join(r[pos[c.lower()]] for c in use) + "~#~\n")
    with open(os.path.join(out, t + ".cols"), "w") as f:
        f.write("\n".join(use) + "\n")
    print(f"{t}\t{len(rs)}")
