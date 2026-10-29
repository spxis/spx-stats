#!/usr/bin/env python3
"""Turso (libSQL over HTTPS) as a second data release target. Imported by release.py; the table list is in TABLES.

Why: production (Supabase Free, 500 MB) cannot hold the admin and bulky tables, and the site reads them from Turso instead
(web/src/lib/turso). A table in TABLES is published to Turso and never to production; a release carries tables of one target only.

How a table is kept equal to DS1 (a derived copy, DS1 stays the truth):
  - every DS1 column is read as text and turned into one canonical Python value (int, bool, float or text; arrays as JSON text,
    bytea as hex, timestamps in UTC), the same way from DS1 and from Turso, so "equal" is exact, row by row (md5 of the row).
  - the comparison is made in Python over the whole table (these tables are under 100,000 rows), in the same shape compare.py
    returns (counts, 256 bucket fingerprints, only1/only2/differ key lists), so release.py's preview and verification work as before.
  - the apply writes in batches of one transaction each (insert or replace by primary key, delete by primary key), then reads the whole
    table back and compares. A release is not one transaction: a failed verification restores the snapshot (rows saved before the apply,
    in gzip TSV and in DS1 schema backup_release_<id>).
  - Turso table names are schema_table (core_external_id) because SQLite has no schemas.

Environment (names only): TURSO_DATABASE_URL (libsql://..., https://... or http://127.0.0.1:<port> for a test server) and
TURSO_AUTH_TOKEN. The auth token is never printed, logged or stored.
"""
import datetime
import gzip
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sync"))
import compare as C  # noqa: E402

# name -> spec. pk: when DS1's relation has no primary key (a materialized view); indexes: [(suffix, [columns])] the site needs;
# columns + select: a derived table whose DS1 source is a query (nulls in a key become '').
SPECS = {
    "core.external_id": {"indexes": [("entity", ["entity_kind", "entity_id"])]},
    "meta.verification": {"indexes": [("entity", ["entity_kind", "entity_id"])]},
    "meta.data_issue": {"indexes": [("entity", ["entity_kind", "entity_key"])]},
    "core.batted_ball_player": {},
    "core.batted_ball_player_hand": {},
    "core.game_field": {},
    "core.betting_line": {"indexes": [("game", ["game_id"])]},
    "api.person_admin": {
        "pk": ["person_id"],
        "indexes": [("letter_first", ["letter_first"]), ("letter_last", ["letter_last"]), ("country", ["country"]),
                    ("birth_year", ["birth_year"]), ("name", ["name", "person_id"])]},
    # The three derived tables are small and computed from DS1's live tables, with the definitions of the api views they replace on
    # production (migrations 015 and 056), so they never wait for a materialized view refresh. Nulls in a key are ''.
    "api.totals": {
        "pk": ["id"],
        "columns": [("id", "integer"), ("lines", "bigint"), ("confirmed", "bigint"), ("issues", "bigint")],
        "select": "select 1 as id, (select count(*) from core.betting_line) as lines, (select count(*) from meta.verification where status = 'confirmed') as confirmed, "
                  "(select count(*) from meta.data_issue) as issues"},
    "api.quality": {
        "pk": ["kind", "source", "entity", "what", "resolution"],
        "columns": [("kind", "text"), ("source", "text"), ("entity", "text"), ("what", "text"), ("resolution", "text"), ("n", "bigint")],
        "select": "select kind, source, entity, what, coalesce(resolution, '') as resolution, n from ("
                  "select 'check' as kind, src.code as source, v.entity_kind as entity, v.status::text as what, null::text as resolution, count(*) as n "
                  "from meta.verification v join meta.source src using (source_id) group by 2, 3, 4 "
                  "union all "
                  "select 'issue', src.code, i.entity_kind, regexp_replace(i.issue, '[0-9]+', '#', 'g'), i.resolution, count(*) "
                  "from meta.data_issue i join meta.source src using (source_id) group by 2, 3, 4, 5) q"},
    "api.provenance": {
        "pk": ["kind", "league", "source", "checked_by", "outcome"],
        "columns": [("kind", "text"), ("league", "text"), ("source", "text"), ("checked_by", "text"), ("outcome", "text"), ("n", "integer")],
        "select": "select r.kind, coalesce(r.league, '') as league, coalesce(ps.code, '') as source, coalesce(vs.code, '') as checked_by, "
                  "coalesce(v.status, 'single') as outcome, count(*)::int as n from ("
                  "select 'game'::text as kind, s.league_code as league, g.source_id, g.game_id as id from core.game g join core.season s using (season_id) where g.status <> 'cancelled' "
                  "union all select 'team_season', s.league_code, t.source_id, t.team_season_id from core.team_season t join core.season s using (season_id) "
                  "union all select 'season', s.league_code, s.source_id, s.season_id from core.season s "
                  "union all select 'person', null, p.source_id, p.person_id from core.person p) r "
                  "left join meta.source ps on ps.source_id = r.source_id "
                  "left join (select distinct on (entity_kind, entity_id) entity_kind, entity_id, status::text as status, source_id from meta.verification "
                  "order by entity_kind, entity_id, (status = 'disputed') desc, (status = 'confirmed') desc, verification_id) v on v.entity_kind = r.kind and v.entity_id = r.id "
                  "left join meta.source vs on vs.source_id = v.source_id "
                  "group by r.kind, r.league, ps.code, vs.code, coalesce(v.status, 'single')"},
}
# Test hook: RELEASE_TURSO_TABLES=none (or a comma list) narrows which tables go to Turso, so tests that use these names as plain
# production tables still run. Unset in every real run.
_ONLY = os.environ.get("RELEASE_TURSO_TABLES")
TABLES = SPECS if _ONLY is None else {n: v for n, v in SPECS.items() if n in {x.strip() for x in _ONLY.split(",")}}
INT_TYPES = ("smallint", "integer", "bigint")
FLOAT_TYPES = ("real", "double precision")
PAGE_ROWS = 5000
CHUNK_ROWS = 300
CHUNK_BYTES = 600_000


class TursoError(RuntimeError):
    pass


def tname(name):
    return name.replace(".", "_")


def is_turso(name):
    return name in TABLES


def split_names(names):
    """(turso names, other names)."""
    return [n for n in names if n in TABLES], [n for n in names if n not in TABLES]


def kind_of(ty):
    if ty.endswith("[]"):
        return "json"
    if ty in INT_TYPES:
        return "int"
    if ty == "boolean":
        return "bool"
    if ty in FLOAT_TYPES:
        return "float"
    return "text"


def ds1_expr(col, ty):
    """SQL on DS1 for one column as text: exact floats (DS1 reads set extra_float_digits=3), UTC timestamps, arrays as JSON, bytea as hex."""
    q = C.qi(col)
    if ty.endswith("[]"):
        return "to_json(%s)::text" % q
    if ty == "bytea":
        return "encode(%s, 'hex')" % q
    if ty.startswith("timestamp with time zone"):
        return "(%s at time zone 'UTC')::text" % q
    return "%s::text" % q


def canon_ds1(kind, v):
    if v is None:
        return None
    if kind == "int":
        return int(v)
    if kind == "bool":
        return v in ("t", "true")
    if kind == "float":
        return float(v)
    return v


def canon_turso(kind, cell):
    if cell is None or cell.get("type") == "null":
        return None
    t, v = cell["type"], cell.get("value")
    if kind == "int":
        return int(v)
    if kind == "bool":
        return int(v) != 0
    if kind == "float":
        return float(v)
    if t == "blob":
        raise TursoError("a blob in a text column")
    return str(v)


def to_arg(kind, v):
    if v is None:
        return {"type": "null"}
    if kind == "bool":
        return {"type": "integer", "value": "1" if v else "0"}
    if kind == "int":
        return {"type": "integer", "value": str(v)}
    if kind == "float":
        return {"type": "float", "value": v}
    return {"type": "text", "value": v}


def text_of(kind, v):
    """The canonical value as a DS1 text literal (for the backup tables and the gzip TSV)."""
    if v is None:
        return None
    if kind == "bool":
        return "true" if v else "false"
    if kind == "float":
        return repr(v)
    return str(v)


def row_hash(row):
    return hashlib.md5(json.dumps(row, separators=(",", ":"), ensure_ascii=True).encode()).hexdigest()


def key_str(t, row):
    return tuple(text_of(t.kind[c], row[t.idx[c]]) for c in t.pk)


def buckets_of(hashes):
    """{bucket: (rows, md5)}: the 256 buckets compare.py uses, here from {key: row hash}; the bucket is the first byte of md5(key)."""
    groups = {}
    for k, h in hashes.items():
        kt = json.dumps(list(k), separators=(",", ":"))
        groups.setdefault(hashlib.md5(kt.encode()).digest()[0], []).append((kt, h))
    out = {}
    for b, items in groups.items():
        items.sort()
        out[b] = (len(items), hashlib.md5(",".join(h for _, h in items).encode()).hexdigest())
    return out


# ---------------------------------------------------------------------------------------------------- the Turso connection

def http_url(url):
    url = url.strip().rstrip("/")
    if url.startswith("libsql://"):
        url = "https://" + url[len("libsql://"):]
    return url


class TursoSide:
    """A Turso database through the HTTP pipeline API (https://docs.turso.tech/sdk/http/reference): plain urllib, no driver."""
    label = "Turso"
    source = False

    def __init__(self, url, token=None):
        self.url, self.token = http_url(url), token

    def post(self, requests, attempts=4, timeout=120):
        body = json.dumps({"requests": requests + [{"type": "close"}]}).encode()
        last = None
        for attempt in range(attempts):
            headers = {"Content-Type": "application/json", "User-Agent": "spx-stats-release/1"}
            if self.token:
                headers["Authorization"] = "Bearer " + self.token
            req = urllib.request.Request(self.url + "/v2/pipeline", data=body, method="POST", headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    data = json.loads(resp.read().decode() or "{}")
                out = []
                for r in data.get("results", [])[:len(requests)]:
                    if r.get("type") != "ok":
                        raise TursoError("Turso: %s" % ((r.get("error") or {}).get("message") or r)[:300])
                    out.append(r["response"])
                return out
            except urllib.error.HTTPError as e:
                text = e.read().decode(errors="replace")[:300]
                last = "HTTP %s %s" % (e.code, text)
                if e.code not in (408, 429, 500, 502, 503, 504):
                    break
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                last = str(e)
            time.sleep(2 * (attempt + 1))
        raise TursoError("Turso: request failed: %s" % last)

    def execute(self, sql, args=None):
        """One statement -> (column names, rows of typed cells)."""
        r = self.post([{"type": "execute", "stmt": {"sql": sql, "args": args or []}}])[0]["result"]
        return [c["name"] for c in r["cols"]], r["rows"]

    def query(self, sql, args=None):
        cols, rows = self.execute(sql, args)
        return [dict(zip(cols, r)) for r in rows]

    def transaction(self, statements):
        """[(sql, args)] in ONE transaction: all are applied or none (a batch with BEGIN, COMMIT and a ROLLBACK on failure)."""
        steps = [{"stmt": {"sql": "BEGIN"}}]
        for i, (sql, args) in enumerate(statements):
            steps.append({"stmt": {"sql": sql, "args": args or []}, "condition": {"type": "ok", "step": i}})
        n = len(statements)
        steps.append({"stmt": {"sql": "COMMIT"}, "condition": {"type": "ok", "step": n}})
        steps.append({"stmt": {"sql": "ROLLBACK"}, "condition": {"type": "not", "cond": {"type": "ok", "step": n + 1}}})
        r = self.post([{"type": "batch", "batch": {"steps": steps}}], attempts=1)[0]["result"]
        errs = [e for e in (r.get("step_errors") or []) if e]
        if errs:
            raise TursoError("Turso: transaction rolled back: %s" % errs[0].get("message", errs[0]))
        if (r.get("step_errors") or [None] * (n + 2))[n + 1] is not None or r["step_results"][n + 1] is None:
            raise TursoError("Turso: the transaction did not commit")

    def exec_script(self, statements):
        """Run statements one after another, each on its own (schema creation)."""
        self.post([{"type": "execute", "stmt": {"sql": s}} for s in statements])

    def tables(self):
        return {r["name"]["value"] for r in self.query("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'")}

    def columns(self, table):
        return [r["name"]["value"] for r in self.query("pragma table_info(%s)" % C.qi(table))]


def side_from_env(url=None, token=None):
    url = url or os.environ.get("TURSO_DATABASE_URL")
    if not url:
        raise TursoError("TURSO_DATABASE_URL is not set (and TURSO_AUTH_TOKEN): Turso tables cannot be released")
    return TursoSide(url, token if token is not None else os.environ.get("TURSO_AUTH_TOKEN"))


def get_side(ctx):
    if getattr(ctx, "turso", None) is None:
        ctx.turso = side_from_env(getattr(ctx, "turso_url", None))
    return ctx.turso


# ---------------------------------------------------------------------------------------------------- tables

class TTable:
    """One Turso table: the columns DS1 and Turso share, with their kinds, and how to read each side."""

    def __init__(self, name, cols, pk, spec):
        self.name, self.spec = name, spec
        self.tname = tname(name)
        self.schema, self.table = name.split(".", 1)
        self.cols = cols                      # [(column, DS1 type)]
        self.types = dict(cols)
        self.kind = {c: kind_of(ty) for c, ty in cols}
        self.common = [c for c, _ in cols]
        self.insert_cols = self.common
        self.idx = {c: i for i, c in enumerate(self.common)}
        self.pk = pk
        self.notes = []

    def ds1_sql(self, offset, limit):
        sel = ",".join("%s as %s" % (ds1_expr(c, ty), C.qi(c)) for c, ty in self.cols)
        if self.spec.get("select"):
            src = "(%s) src_" % self.spec["select"]
        else:
            src = self.src_ds1()
        order = ",".join(C.qi(c) + ' collate "C"' if self.kind[c] == "text" else C.qi(c) for c in self.pk)
        return "select %s from %s order by %s limit %d offset %d" % (sel, src, order, limit, offset)

    def src_ds1(self):
        f = C.PUBLISH_FILTER.get(self.name)
        return "%s.%s" % (C.qi(self.schema), C.qi(self.table)) if not f else "(select * from %s.%s where %s) pf_" % (C.qi(self.schema), C.qi(self.table), f)


def read_ds1(ds1, t):
    """{key: canonical row tuple} of the DS1 side."""
    out, off = {}, 0
    while True:
        part = ds1.run(t.ds1_sql(off, PAGE_ROWS))
        for r in part:
            row = tuple(canon_ds1(t.kind[c], r[c]) for c in t.common)
            out[key_str(t, row)] = row
        if len(part) < PAGE_ROWS:
            return out
        off += PAGE_ROWS


def read_turso(side, t, only_keys=None):
    """{key: canonical row tuple} of the whole Turso table (keyset pages on the primary key), or only the given keys."""
    out = {}
    cols = ",".join(C.qi(c) for c in t.common)
    pkc = ",".join(C.qi(c) for c in t.pk)
    if only_keys is not None:
        keys = sorted(only_keys)
        for i in range(0, len(keys), 200):
            part = keys[i:i + 200]
            cond = " or ".join("(%s)" % " and ".join("%s = ?" % C.qi(c) for c in t.pk) for _ in part)
            args = [to_arg(t.kind[c], canon_ds1(t.kind[c], v)) for k in part for c, v in zip(t.pk, k)]
            _, rows = side.execute("select %s from %s where %s" % (cols, C.qi(t.tname), cond), args)
            for r in rows:
                row = tuple(canon_turso(t.kind[c], cell) for c, cell in zip(t.common, r))
                out[key_str(t, row)] = row
        return out
    last = None
    while True:
        if last is None:
            sql, args = "select %s from %s order by %s limit %d" % (cols, C.qi(t.tname), pkc, PAGE_ROWS), []
        else:
            ph = ",".join("?" for _ in t.pk)
            sql = "select %s from %s where (%s) > (%s) order by %s limit %d" % (cols, C.qi(t.tname), pkc, ph, pkc, PAGE_ROWS)
            args = [to_arg(t.kind[c], v) for c, v in zip(t.pk, last)]
        _, rows = side.execute(sql, args)
        for r in rows:
            row = tuple(canon_turso(t.kind[c], cell) for c, cell in zip(t.common, r))
            out[key_str(t, row)] = row
        if len(rows) < PAGE_ROWS:
            return out
        lastrow = tuple(canon_turso(t.kind[c], cell) for c, cell in zip(t.common, rows[-1]))
        last = [lastrow[t.idx[c]] for c in t.pk]


def ds1_columns(ds1, name):
    """[(column, type)] and the primary key of a DS1 relation (table or materialized view), from its catalog."""
    schema, table = name.split(".", 1)
    ident = "%s.%s" % (C.qi(schema), C.qi(table))
    cols = ds1.run("select a.attname as n, format_type(a.atttypid, a.atttypmod) as ty from pg_attribute a "
                   "where a.attrelid = %s::regclass and a.attnum > 0 and not a.attisdropped order by a.attnum" % C.ql(ident))
    pk = ds1.run("select a.attname as n from pg_index i cross join lateral unnest(i.indkey::int2[]) with ordinality as k(attnum, ord) "
                 "join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum where i.indrelid = %s::regclass and i.indisprimary order by k.ord" % C.ql(ident))
    return [(c["n"], c["ty"]) for c in cols], [r["n"] for r in pk]


def load_table(ds1, name):
    spec = TABLES[name]
    if spec.get("columns"):
        cols, pk = list(spec["columns"]), []
    else:
        cols, pk = ds1_columns(ds1, name)
    if not cols:
        raise TursoError("%s does not exist on DS1" % name)
    pk = spec.get("pk") or pk
    t = TTable(name, cols, pk, spec)
    if not pk or any(k not in t.types for k in pk):
        t.pk = None
    return t


def load_tables(ctx, names):
    """{name: (TTable or None, blockers, warnings)}: DS1's columns against Turso's."""
    side = get_side(ctx)
    have = side.tables()
    out = {}
    for n in names:
        try:
            t = load_table(ctx.ds1, n)
        except (RuntimeError, ValueError) as e:
            out[n] = (None, ["%s does not exist on DS1 (%s)" % (n, str(e)[:100])], [])
            continue
        bl, wa = [], []
        if not t.pk:
            bl.append("no usable primary key")
        if t.tname not in have:
            bl.append("%s does not exist in Turso: create the schema first (release.py turso-schema --apply)" % t.tname)
        else:
            tc = set(side.columns(t.tname))
            missing = [c for c in t.common if c not in tc]
            if missing:
                bl.append("Turso %s lacks the columns %s: re-run turso-schema for them" % (t.tname, ",".join(missing)))
            extra = sorted(tc - set(t.common))
            if extra:
                wa.append("columns only in Turso (not compared): " + ",".join(extra))
        out[n] = (t, bl, wa)
    return out


def diff_rows(r1, r2):
    h1 = {k: row_hash(list(v)) for k, v in r1.items()}
    h2 = {k: row_hash(list(v)) for k, v in r2.items()}
    return {"ds1": len(r1), "prod": len(r2), "b1": buckets_of(h1), "b2": buckets_of(h2),
            "only1": sorted(k for k in h1 if k not in h2), "only2": sorted(k for k in h2 if k not in h1),
            "differ": sorted(k for k in h1 if k in h2 and h1[k] != h2[k]), "_rows1": r1, "_rows2": r2}


def diff_table(ctx, t):
    return diff_rows(read_ds1(ctx.ds1, t), read_turso(get_side(ctx), t))


def diff_tables(ctx, names):
    """Like release.diff_tables: ({name: (TTable, diff)}, {name: blockers}, {name: warnings})."""
    tabs = load_tables(ctx, names)
    diffs, blockers, warnings = {}, {}, {}
    for n in names:
        t, bl, wa = tabs[n]
        blockers[n], warnings[n] = bl, wa
        if t is not None and t.pk and not bl:
            diffs[n] = (t, diff_table(ctx, t))
    return diffs, blockers, warnings


# ---------------------------------------------------------------------------------------------------- apply, verify

def upsert_statement(t, row):
    cols = ",".join(C.qi(c) for c in t.common)
    ph = ",".join("?" for _ in t.common)
    return ("insert or replace into %s (%s) values (%s)" % (C.qi(t.tname), cols, ph),
            [to_arg(t.kind[c], v) for c, v in zip(t.common, row)])


def delete_statement(t, key):
    where = " and ".join("%s = ?" % C.qi(c) for c in t.pk)
    return ("delete from %s where %s" % (C.qi(t.tname), where), [to_arg(t.kind[c], canon_ds1(t.kind[c], v)) for c, v in zip(t.pk, key)])


def chunks(statements):
    buf, size = [], 0
    for st in statements:
        n = len(json.dumps(st[1])) + len(st[0])
        if buf and (len(buf) >= CHUNK_ROWS or size + n > CHUNK_BYTES):
            yield buf
            buf, size = [], 0
        buf.append(st)
        size += n
    if buf:
        yield buf


def apply_diff(side, t, d):
    """Write what DS1 has and Turso lacks or has differently, delete what only Turso has: in transactions of CHUNK_ROWS rows, deletes first.
    Every statement is idempotent, so a lost answer can simply be run again."""
    stm = [delete_statement(t, k) for k in d["only2"]]
    stm += [upsert_statement(t, d["_rows1"][k]) for k in list(d["only1"]) + list(d["differ"])]
    for part in chunks(stm):
        side.transaction(part)


def verify_equal(ctx, t, want_buckets):
    return buckets_of({k: row_hash(list(v)) for k, v in read_turso(get_side(ctx), t).items()}) == want_buckets


def count_rows(ctx, t):
    return int(get_side(ctx).execute("select count(*) from %s" % C.qi(t.tname))[1][0][0]["value"])


# ---------------------------------------------------------------------------------------------------- snapshot, restore

def tsv_cell(v):
    if v is None:
        return "\\N"
    return v.replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r")


def write_gz(path, text):
    with gzip.open(path, "wt", encoding="utf-8", newline="\n") as f:
        f.write(text)


def snapshot(ctx, rid, number, items, snap_dir):
    """Save Turso's current rows for everything the release will update or delete, and the keys it will insert: gzip TSV per table
    under snap_dir/<number>/ and DS1 schema backup_release_<id> (all columns text). Never into Turso or production."""
    folder = os.path.join(snap_dir, number)
    os.makedirs(folder, exist_ok=True)
    schema = "backup_release_%d" % rid
    ctx.w.exec("create schema %s" % schema)
    manifest = {"number": number, "id": rid, "schema": schema, "target": "turso", "tables": {}}
    for name, t, d in items:
        lines = []
        for k in sorted(d["differ"] + d["only2"]):
            row = d["_rows2"][k]
            lines.append("\t".join(tsv_cell(text_of(t.kind[c], v)) for c, v in zip(t.common, row)))
        data = "".join(x + "\n" for x in lines)
        ins = "".join("\t".join(tsv_cell(v) for v in k) + "\n" for k in sorted(d["only1"]))
        fn = tname(name)
        write_gz(os.path.join(folder, fn + ".tsv.gz"), data)
        write_gz(os.path.join(folder, fn + ".inserted.tsv.gz"), ins)
        bt, bi = "%s.%s" % (schema, C.qi(name)), "%s.%s" % (schema, C.qi(name + "__ins"))
        ctx.w.exec("create table %s (%s);\ncreate table %s (%s)" % (
            bt, ",".join("%s text" % C.qi(c) for c in t.common), bi, ",".join("%s text" % C.qi(c) for c in t.pk)))
        if data:
            ctx.w.copy_in(bt, t.common, data)
        if ins:
            ctx.w.copy_in(bi, t.pk, ins)
        manifest["tables"][name] = {"columns": t.common, "pk": t.pk, "restore": len(lines), "inserted": len(d["only1"])}
    with open(os.path.join(folder, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    return schema


def restore(ctx, rid, names, before_fp=None, fp=None):
    """Put Turso back from the snapshot of release id <rid>: rewrite updated and deleted rows, remove inserted ones."""
    side = get_side(ctx)
    schema = "backup_release_%d" % rid
    for n in names:
        t = load_table(ctx.ds1, n)
        bt, bi = "%s.%s" % (schema, C.qi(n)), "%s.%s" % (schema, C.qi(n + "__ins"))
        sel = ",".join(C.qi(c) + "::text" + " as " + C.qi(c) for c in t.common)
        saved = ctx.ds1.run("select %s from %s" % (sel, bt))
        inserted = ctx.ds1.run("select %s from %s" % (",".join(C.qi(c) + " as " + C.qi(c) for c in t.pk), bi))
        stm = [delete_statement(t, tuple(r[c] for c in t.pk)) for r in inserted]
        for r in saved:
            row = tuple(canon_ds1(t.kind[c], r[c]) for c in t.common)
            stm.append(upsert_statement(t, row))
        for part in chunks(stm):
            side.transaction(part)
        if before_fp and fp is not None:
            got = fp(buckets_of({k: row_hash(list(v)) for k, v in read_turso(side, t).items()}))
            if got != before_fp[n]:
                raise RuntimeError("after the restore %s does not match its state before the release" % n)


# ---------------------------------------------------------------------------------------------------- schema

def sqlite_type(kind):
    return {"int": "INTEGER", "bool": "INTEGER", "float": "REAL"}.get(kind, "TEXT")


def schema_statements(ds1, names=None):
    """CREATE TABLE / CREATE INDEX IF NOT EXISTS statements for Turso, from DS1's catalog."""
    out = []
    for n in names or sorted(TABLES):
        t = load_table(ds1, n)
        if not t.pk:
            raise TursoError("%s has no primary key on DS1 and none in TABLES" % n)
        cols = ",\n  ".join("%s %s" % (C.qi(c), sqlite_type(t.kind[c])) for c in t.common)
        out.append("create table if not exists %s (\n  %s,\n  primary key (%s)\n)" % (C.qi(t.tname), cols, ",".join(C.qi(c) for c in t.pk)))
        for suffix, icols in TABLES[n].get("indexes", []):
            out.append("create index if not exists %s on %s (%s)" % (C.qi("%s_%s_idx" % (t.tname, suffix)), C.qi(t.tname), ",".join(C.qi(c) for c in icols)))
    return out


def now_utc():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
