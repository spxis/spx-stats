#!/usr/bin/env python3
"""Compare DS1 (source of truth) with production, table by table, by primary key and a per-row hash.

Read-only on both sides. Per table: one bucketed pass (rows grouped by the first byte of md5 of the key, 256 buckets,
one aggregate md5 per bucket), then a drill into the differing buckets only. Writes, in --out:
  <table>.to_prod.sql   insert-only SQL: rows DS1 has and production lacks (on conflict do nothing)
  <table>.prod_only.tsv keys production has and DS1 lacks (report only; never delete)
  <table>.diff.tsv      same key, different values (column, DS1 value, production value)

DS1: psql with PG* env (PGHOST, PGPASSWORD, ...; SPX_DS1_HOST fills in PGHOST/PGPORT/PGUSER/PGDATABASE defaults).
Production: Supabase Management API (SUPABASE_ACCESS_TOKEN from the environment).
Tests: --ds1-dsn and --prod-dsn point either side at any Postgres reachable by psql.
Exit code: 0 all same, 1 differences found, 2 error.
"""
import argparse
import json
import os
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict

PROJECT_REF = "njpvfrceahkvnrduerkk"
SCHEMAS = ("core", "meta", "ref")
BUCKETS = 256

# What production publishes of a table, when it is less than all of DS1's rows: {"schema.table": "sql condition on the table's columns"}.
# The condition is applied to the DS1 side ONLY, in every read that compares, hashes, counts, copies or verifies (Table.src), so
# "production equals DS1" means "production equals DS1 filtered". Production-side reads are never filtered, so production rows that
# fail the condition count as "only in production" and a release removes them (a table shrinking by more than 5 percent needs
# --replace, as always). It is code, never user input: the text is put into SQL as is. Only add a table nothing on the site reads
# and nothing references; the full table stays on DS1 (the source of truth).
#   core.external_id: the 437k 'game' ids (about 80 MB with indexes, 2026-10) are not read by any api view or page and Supabase Free
#   caps the database at 500 MB. entity_kind is NOT NULL, so <> is complete.
PUBLISH_FILTER = {
    "core.external_id": "entity_kind <> 'game'",
}


def qi(name):
    return '"' + name.replace('"', '""') + '"'


def ql(value):
    return "'" + str(value).replace("'", "''") + "'"


class PsqlSide:
    """A Postgres reached with psql. dsn None means PG* env."""

    def __init__(self, label, dsn=None, chunk_rows=2_000_000, drill_rows=50_000, source=None):
        self.label, self.dsn = label, dsn
        # the DS1 side: reads of a table with a PUBLISH_FILTER are filtered. Default: a side labelled "DS1" (tests label stand-ins so).
        self.source = (label == "DS1") if source is None else source
        self.chunk_rows, self.drill_rows = chunk_rows, drill_rows

    def run(self, sql):
        env = dict(os.environ)
        env["PGOPTIONS"] = "-c default_transaction_read_only=on -c extra_float_digits=3"
        env["PGCONNECT_TIMEOUT"] = "15"
        if self.dsn is None and os.environ.get("SPX_DS1_HOST") and not env.get("PGHOST"):
            env["PGHOST"] = os.environ["SPX_DS1_HOST"]
            env.setdefault("PGPORT", "55440")
            env.setdefault("PGUSER", "postgres")
            env.setdefault("PGDATABASE", "spx_stats")
        cmd = ["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"]
        if self.dsn:
            cmd += [self.dsn]
        cmd += ["-f", "-"]
        wrapped = "select coalesce(json_agg(q_), '[]'::json) from (\n%s\n) q_;" % sql
        r = subprocess.run(cmd, input=wrapped, capture_output=True, text=True, env=env, timeout=1800)
        if r.returncode != 0:
            raise RuntimeError("%s: psql failed: %s" % (self.label, r.stderr.strip()[:500]))
        return json.loads(r.stdout.strip() or "[]")


class ApiSide:
    """Production through the Supabase Management API query endpoint, in small queries with retries."""

    def __init__(self, ref, token, chunk_rows=100_000, drill_rows=10_000, url=None):
        self.label = "production"
        self.source = False  # production is never filtered
        self.url = url or "https://api.supabase.com/v1/projects/%s/database/query" % ref
        self.token = token
        self.chunk_rows, self.drill_rows = chunk_rows, drill_rows

    def run(self, sql):
        wrapped = "select coalesce(json_agg(q_), '[]'::json) as j from (\n%s\n) q_" % sql
        data = self.post(wrapped)
        j = data[0]["j"]
        return json.loads(j) if isinstance(j, str) else j

    def post(self, query, attempts=5, timeout=90):
        """Send one query text as is and return the parsed answer. A failed answer is retried only for transient errors."""
        body = json.dumps({"query": query}).encode()
        last = None
        for attempt in range(attempts):
            req = urllib.request.Request(
                self.url, data=body, method="POST",
                headers={"Authorization": "Bearer " + self.token, "Content-Type": "application/json",
                         "User-Agent": "spx-stats-sync/1"})
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    return json.loads(resp.read().decode() or "[]")
            except urllib.error.HTTPError as e:
                text = e.read().decode(errors="replace")[:300]
                last = "HTTP %s %s" % (e.code, text)
                if e.code not in (408, 429, 500, 502, 503, 504):
                    break
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                last = str(e)
            time.sleep(2 * (attempt + 1))
        raise RuntimeError("production: query failed: %s" % last)


CATALOG_SQL = """
select c.relnamespace::regnamespace::text as s, c.relname as t,
  (select json_agg(json_build_object('n', a.attname, 'ty', format_type(a.atttypid, a.atttypmod),
     'g', a.attgenerated::text, 'i', a.attidentity::text) order by a.attname)
   from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as cols,
  (select json_agg(a.attname order by k.ord)
   from pg_index i
   cross join lateral unnest(i.indkey::int2[]) with ordinality as k(attnum, ord)
   join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
   where i.indrelid = c.oid and i.indisprimary) as pk
from pg_class c
where c.relkind in ('r', 'p') and not c.relispartition
  and c.relnamespace::regnamespace::text in (%s)
  and not (c.relnamespace = 'meta'::regnamespace
           and (c.relname in ('data_release', 'sync_status', 'release_secret', 'auto_approval', 'score_update_request', 'api_health_event', 'ops_status', 'ops_request') or c.relname ~ '^r[sd]_[0-9]'))
order by 1, 2
""" % ",".join(ql(s) for s in SCHEMAS)

# Every foreign key on the database, validated or NOT VALID (both are enforced on new writes), in any schema. Names are built from
# nspname.relname, not from regclass::text: that prints "position" in quotes ('ref."position"') and drops the schema when the table
# is on the search_path, so the edge never matched the plain "ref.position" names the release uses (release 2026.10.13-11 and -13).
FK_SQL = """
select cn.nspname || '.' || cr.relname as child, pn.nspname || '.' || pr.relname as parent, c.conname as name,
  c.convalidated as validated
from pg_constraint c
join pg_class cr on cr.oid = c.conrelid join pg_namespace cn on cn.oid = cr.relnamespace
join pg_class pr on pr.oid = c.confrelid join pg_namespace pn on pn.oid = pr.relnamespace
where c.contype = 'f'
"""


class FkCycle(RuntimeError):
    """The tables of a release point at each other in a loop, so no order of statements can keep every foreign key true."""


def fk_edges(*sides):
    """{(child, parent): [constraint names]} from the foreign keys of every side given (DS1 and production), as schema.table."""
    out = defaultdict(set)
    for side in sides:
        if side is None:
            continue
        for e in side.run(FK_SQL):
            out[(e["child"], e["parent"])].add(e["name"])
    return {k: sorted(v) for k, v in out.items()}


def catalog(side):
    return {"%s.%s" % (r["s"], r["t"]): r for r in side.run(CATALOG_SQL)}


FLOAT_SEND = {"double precision": "float8send", "real": "float4send"}


def cexpr(col, ty):
    """Text of a column for hashing and comparing; timestamptz is pinned to UTC so session time zones do not matter,
    and float columns are their exact bits in hex, because the text of a float depends on the session's extra_float_digits
    (the Management API answers with 15 digits) while the stored value is the same."""
    if ty in FLOAT_SEND:
        return "(encode(%s(%s), 'hex'))" % (FLOAT_SEND[ty], qi(col))
    if ty.startswith("timestamp with time zone"):
        return "((%s at time zone 'UTC')::text)" % qi(col)
    return "(%s::text)" % qi(col)


def vexpr(col, ty=None):
    """Text of a column to copy as a value. With ty given, a float column comes back as hex bits (float_text turns it into
    exact text); use that for anything read from production. DS1 reads set extra_float_digits=3, so plain text is exact."""
    if ty in FLOAT_SEND:
        return cexpr(col, ty)
    return "%s::text" % qi(col)


def float_text(hexbits):
    """The exact text of a float4 (8 hex digits) or float8 (16 hex digits) given as hex bits."""
    if hexbits is None:
        return None
    v = struct.unpack(">d" if len(hexbits) == 16 else ">f", bytes.fromhex(hexbits))[0]
    if v != v:
        return "NaN"
    if v in (float("inf"), float("-inf")):
        return "Infinity" if v > 0 else "-Infinity"
    return repr(v)


class Table:
    def __init__(self, name, ds1_cat, prod_cat):
        self.name = name
        self.schema, self.table = name.split(".", 1)
        self.fq = "%s.%s" % (qi(self.schema), qi(self.table))
        d = {c["n"]: c for c in ds1_cat["cols"]}
        p = {c["n"]: c for c in prod_cat["cols"]}
        self.notes = []
        self.pk = ds1_cat["pk"]
        common = sorted(set(d) & set(p))
        if set(d) - set(p):
            self.notes.append("columns only on DS1 (not compared): " + ",".join(sorted(set(d) - set(p))))
        if set(p) - set(d):
            self.notes.append("columns only on production (not compared): " + ",".join(sorted(set(p) - set(d))))
        for c in common:
            if d[c]["ty"] != p[c]["ty"]:
                self.notes.append("type differs for %s: DS1 %s, production %s" % (c, d[c]["ty"], p[c]["ty"]))
        self.common = common
        self.filter = PUBLISH_FILTER.get(name)
        self.types = {c: d[c]["ty"] for c in common}
        self.insert_cols = [c for c in common if d[c]["g"] != "s"]
        self.identity_cols = [c for c in self.insert_cols if d[c]["i"] in ("a", "d")]
        if not self.pk or any(k not in p for k in self.pk) or any(k not in d for k in self.pk):
            self.pk = None
        else:
            pp = prod_cat["pk"]
            if pp != self.pk:
                self.notes.append("primary key differs: DS1 %s, production %s" % (self.pk, pp))
        if self.pk:
            kt = "row(%s)::text" % ",".join(cexpr(k, self.types[k]) for k in self.pk)
            kjson = "json_build_array(%s)" % ",".join(cexpr(k, self.types[k]) for k in self.pk)
            h = "md5(row(%s)::text)" % ",".join(cexpr(c, self.types[c]) for c in common)
            self._base = ("select %s as kt, %s as k, %s as h, get_byte(decode(md5(%s), 'hex'), 0) as b from %%s"
                          % (kt, kjson, h, kt))

    def src(self, side):
        """What to read rows from on this side (for a from clause): the table, or on the DS1 side of a table with a PUBLISH_FILTER
        a subquery of just the rows production publishes. Production (and any non-source side) always reads the whole table."""
        if self.filter and getattr(side, "source", False):
            return "(select * from %s where %s) pf_" % (self.fq, self.filter)
        return self.fq

    def base(self, side):
        """The per-row query (key text, key json, row hash, bucket) over this side's rows."""
        return self._base % self.src(side)

    def key_filter(self, keys):
        """where-clause matching a list of keys (each a list of text values), compared as text."""
        exprs = [cexpr(k, self.types[k]) if self.types[k].startswith("timestamp with time zone") else qi(k)
                 for k in self.pk]
        if len(exprs) == 1:
            return "%s in (%s)" % (exprs[0], ",".join(ql(k[0]) for k in keys))
        return "(%s) in (%s)" % (",".join(exprs), ",".join("(%s)" % ",".join(ql(v) for v in k) for k in keys))


def count_rows(side, t):
    return side.run("select count(*) as n from %s" % t.src(side))[0]["n"]


def bucket_pass(side, t, n):
    """{bucket: (rows, md5)} for the whole table, in chunks of buckets so no single query scans too much."""
    chunks = max(1, min(BUCKETS, -(-n // side.chunk_rows)))
    step = -(-BUCKETS // chunks)
    out = {}
    for lo in range(0, BUCKETS, step):
        sql = ("select b, count(*) as n, md5(string_agg(h, ',' order by kt collate \"C\")) as m from (%s) x "
               "where b >= %d and b < %d group by b" % (t.base(side), lo, lo + step))
        for r in side.run(sql):
            out[r["b"]] = (r["n"], r["m"])
    return out


def groups(buckets, counts, limit):
    cur, size, res = [], 0, []
    for b in sorted(buckets):
        n = counts.get(b, (0, ""))[0]
        if cur and size + n > limit:
            res.append(cur)
            cur, size = [], 0
        cur.append(b)
        size += n
    if cur:
        res.append(cur)
    return res


def drill(side, t, buckets, counts):
    """{key tuple: row hash} for rows in the given buckets."""
    rows = {}
    for g in groups(buckets, counts, side.drill_rows):
        sql = "select k, h from (%s) x where b in (%s)" % (t.base(side), ",".join(str(b) for b in g))
        for r in side.run(sql):
            rows[tuple(r["k"])] = r["h"]
    return rows


def insert_sql(ds1, t, keys, batch=500):
    cols = t.insert_cols
    head = "insert into %s (%s) overriding system value values\n" % (t.fq, ",".join(qi(c) for c in cols))
    tuple_expr = "'(' || concat_ws(',', %s) || ')'" % ",".join("quote_nullable(%s)" % vexpr(c) for c in cols)
    stmts = []
    keys = sorted(keys)
    for i in range(0, len(keys), 2000):
        part = keys[i:i + 2000]
        order = ",".join(cexpr(k, t.types[k]) + ' collate "C"' for k in t.pk)
        rows = ds1.run("select %s as v from %s where %s order by %s" % (tuple_expr, t.src(ds1), t.key_filter(part), order))
        stmts.extend(r["v"] for r in rows)
    out = []
    for i in range(0, len(stmts), batch):
        out.append(head + ",\n".join(stmts[i:i + batch]) + "\non conflict do nothing;\n")
    for c in t.identity_cols:
        out.append("select setval(pg_get_serial_sequence(%s, %s), coalesce((select max(%s) from %s), 1));\n"
                   % (ql(t.fq), ql(c), qi(c), t.fq))
    return "".join(out)


def fetch_rows(side, t, keys):
    """{key tuple: {column: text}} for the given keys."""
    cols = ",".join("%s as %s" % (cexpr(c, t.types[c]), qi(c)) for c in t.common)
    kj = "json_build_array(%s)" % ",".join(cexpr(k, t.types[k]) for k in t.pk)
    res = {}
    keys = sorted(keys)
    for i in range(0, len(keys), 200):
        part = keys[i:i + 200]
        sql = ("select %s as k, (select to_jsonb(x) from (select %s) x) as r from %s where %s"
               % (kj, cols, t.src(side), t.key_filter(part)))
        for r in side.run(sql):
            res[tuple(r["k"])] = r["r"]
    return res


def tsv(*cells):
    return "\t".join(str(c).replace("\t", " ").replace("\n", "\\n") if c is not None else "\\N" for c in cells) + "\n"


def diff_table(ds1, prod, t):
    """Both sides of one table compared by key. Returns counts, the bucket fingerprints and the key lists."""
    n1, n2 = count_rows(ds1, t), count_rows(prod, t)
    b1, b2 = bucket_pass(ds1, t, n1), bucket_pass(prod, t, n2)
    bad = [b for b in range(BUCKETS) if b1.get(b) != b2.get(b)]
    d = {"ds1": n1, "prod": n2, "b1": b1, "b2": b2, "only1": [], "only2": [], "differ": []}
    if bad:
        r1, r2 = drill(ds1, t, bad, b1), drill(prod, t, bad, b2)
        d["only1"] = [k for k in r1 if k not in r2]
        d["only2"] = [k for k in r2 if k not in r1]
        d["differ"] = [k for k in r1 if k in r2 and r1[k] != r2[k]]
    return d


def compare_table(ds1, prod, t, outdir, detail_limit):
    d = diff_table(ds1, prod, t)
    n1, n2, only1, only2, differ = d["ds1"], d["prod"], d["only1"], d["only2"], d["differ"]
    result = {"ds1": n1, "prod": n2, "only_ds1": len(only1), "only_prod": len(only2), "diff": len(differ)}
    base = os.path.join(outdir, t.name)
    for ext in (".to_prod.sql", ".prod_only.tsv", ".diff.tsv"):
        if os.path.exists(base + ext):
            os.remove(base + ext)
    if not (only1 or only2 or differ):
        return result
    if only1:
        with open(base + ".to_prod.sql", "w") as f:
            f.write("-- %s: %d rows DS1 has and production lacks (insert-only)\n" % (t.name, len(only1)))
            f.write(insert_sql(ds1, t, only1))
    if only2:
        with open(base + ".prod_only.tsv", "w") as f:
            f.write(tsv(*t.pk))
            for k in sorted(only2):
                f.write(tsv(*k))
    if differ:
        shown = sorted(differ)[:detail_limit]
        d1, d2 = fetch_rows(ds1, t, shown), fetch_rows(prod, t, shown)
        with open(base + ".diff.tsv", "w") as f:
            f.write(tsv(*(list(t.pk) + ["column", "ds1_value", "prod_value"])))
            for k in shown:
                a, b = d1.get(k, {}), d2.get(k, {})
                for c in t.common:
                    if a.get(c) != b.get(c):
                        f.write(tsv(*(list(k) + [c, a.get(c), b.get(c)])))
            for k in sorted(differ)[detail_limit:]:
                f.write(tsv(*(list(k) + ["(detail skipped: over --detail-limit)", None, None])))
    return result


def apply_order(tables, ds1, prod=None, strict=True):
    """The tables in parents-first order: a table comes after every table of the list that it has a foreign key to, on DS1 or on
    production (prod, when given), validated or not, in any schema. Deterministic and stable: tables that do not depend on each
    other keep the order they were given in, and a round puts every table that became ready in that order. A foreign key from a table
    to itself needs no order (it holds at the end of one statement). A loop between two or more tables of the list raises FkCycle
    naming it (strict), or leaves the tables of the loop at the end in the given order (strict=False, for reports only).
    Reverse the result for children first."""
    edges = fk_edges(ds1, prod)
    names = list(dict.fromkeys(tables))
    inside = set(names)
    deps = {x: set() for x in names}
    for (c, p), _ in edges.items():
        if c != p and c in inside and p in inside:
            deps[c].add(p)
    done, order, left = set(), [], names
    while left:
        ready = [x for x in left if deps[x] <= done]
        if not ready:
            if strict:
                raise FkCycle(cycle_message(left, deps, edges))
            order += left
            break
        order += ready
        done.update(ready)
        left = [x for x in left if x not in done]
    return order


def cycle_message(left, deps, edges):
    """Name one loop among the tables that could not be placed: every one of them still depends on another of them."""
    stuck = set(left)
    node = left[0]
    path = [node]
    while True:
        node = sorted(deps[node] & stuck)[0]
        if node in path:
            path = path[path.index(node):] + [node]
            break
        path.append(node)
    keys = ["%s (%s)" % (a, ", ".join(edges[(a, b)])) for a, b in zip(path, path[1:])]
    return ("foreign keys between the tables of this release form a loop, so no order can keep them true: %s. "
            "Release the tables in separate steps, or change the keys: %s" % (" -> ".join(path), "; ".join(keys)))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", required=True, help="directory for the .to_prod.sql, .prod_only.tsv and .diff.tsv files")
    ap.add_argument("--tables", help="comma-separated schema.table list (default: every table in core, meta, ref)")
    ap.add_argument("--project-ref", default=PROJECT_REF)
    ap.add_argument("--ds1-dsn", help="test only: psql connection string for the DS1 side instead of PG* env")
    ap.add_argument("--prod-dsn", help="test only: psql connection string for the production side instead of the API")
    ap.add_argument("--detail-limit", type=int, default=2000, help="max differing keys to list column by column")
    a = ap.parse_args()

    if not a.ds1_dsn and not (os.environ.get("SPX_DS1_HOST") or os.environ.get("PGHOST")):
        print("set SPX_DS1_HOST (or PGHOST) and PGPASSWORD for DS1", file=sys.stderr)
        return 2
    ds1 = PsqlSide("DS1", a.ds1_dsn)
    if a.prod_dsn:
        prod = PsqlSide("production (test dsn)", a.prod_dsn, chunk_rows=100_000, drill_rows=10_000)
    else:
        token = os.environ.get("SUPABASE_ACCESS_TOKEN")
        if not token:
            print("SUPABASE_ACCESS_TOKEN is not set (export it from the keychain item 'spx-stats SUPABASE_ACCESS_TOKEN')",
                  file=sys.stderr)
            return 2
        prod = ApiSide(a.project_ref, token)
    os.makedirs(a.out, exist_ok=True)

    try:
        c1, c2 = catalog(ds1), catalog(prod)
        wanted = set(a.tables.split(",")) if a.tables else None
        names = sorted(n for n in set(c1) | set(c2) if wanted is None or n in wanted)
        any_diff = False
        sql_files = []
        for name in names:
            if name not in c2:
                print("%-34s MISSING IN PRODUCTION (apply the migration first)" % name)
                any_diff = True
                continue
            if name not in c1:
                print("%-34s only in production (table not on DS1)" % name)
                any_diff = True
                continue
            t = Table(name, c1[name], c2[name])
            if not t.pk:
                print("%-34s SKIPPED: no usable primary key on both sides" % name)
                any_diff = True
                continue
            r = compare_table(ds1, prod, t, a.out, a.detail_limit)
            if r["only_ds1"] or r["only_prod"] or r["diff"]:
                any_diff = True
                print("%-34s DIFF  ds1=%d prod=%d  only-in-DS1=%d only-in-prod=%d different=%d"
                      % (name, r["ds1"], r["prod"], r["only_ds1"], r["only_prod"], r["diff"]))
                if r["only_ds1"]:
                    sql_files.append(name)
            else:
                print("%-34s same  (%d rows)" % (name, r["ds1"]))
            for note in t.notes:
                print("    note: " + note)
        if sql_files:
            order = [x for x in apply_order(list(c1), ds1, strict=False) if x in sql_files]
            with open(os.path.join(a.out, "apply_order.txt"), "w") as f:
                f.write("\n".join(x + ".to_prod.sql" for x in order) + "\n")
            print("apply order (parents first): " + " ".join(order))
        print("files in " + a.out)
        return 1 if any_diff else 0
    except RuntimeError as e:
        print("ERROR: %s" % e, file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
