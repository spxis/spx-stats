"""Copy the local working database into the Supabase project through the
Management API (POST /v1/projects/{ref}/database/query), one batch of rows at a
time. Postgres itself is not reachable from the build machine, and nothing here
opens an endpoint of its own: the only door is the owner's access token.

Usage:
  SUPABASE_ACCESS_TOKEN=... python3 -I scripts/supabase/load.py [--ref REF]
      [--schemas meta,ref,core,legacy_spx] [--migrations] [--replace]

--migrations  apply db/migrations/002 onwards first (001 and 003 are applied
              by migration name already; 002 is created if legacy_spx is absent)
--replace     empty each table before loading it (default: refuse a table that
              already holds rows)
"""
import argparse, json, os, subprocess, sys, time, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOCAL = ["psql", "-h", "/tmp", "-p", "55432", "-U", "postgres", "-d", "spx_stats", "-X", "-At", "-v", "ON_ERROR_STOP=1"]
BATCH_BYTES = 2_000_000


def api(ref, token, sql, tries=4):
    body = json.dumps({"query": sql}).encode()
    for attempt in range(tries):
        req = urllib.request.Request(
            f"https://api.supabase.com/v1/projects/{ref}/database/query", data=body, method="POST",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.loads(r.read() or b"null")
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:500]
            if e.code in (429, 502, 503, 504) and attempt < tries - 1:
                time.sleep(2 ** attempt * 5); continue
            raise SystemExit(f"Supabase refused ({e.code}): {msg}")
        except urllib.error.URLError:
            if attempt < tries - 1:
                time.sleep(2 ** attempt * 5); continue
            raise


def local(sql):
    return subprocess.run(LOCAL + ["-c", sql], check=True, capture_output=True, text=True).stdout


def tables_in_order(schemas):
    """Tables of the given schemas, parents before children."""
    rows = local(f"""
      with recursive t as (
        select c.oid, n.nspname || '.' || c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'r' and n.nspname = any('{{{",".join(schemas)}}}')),
      d as (select t.oid, t.name, 0 as depth from t
            union all
            select t.oid, t.name, d.depth + 1 from t join pg_constraint k on k.conrelid = t.oid and k.contype = 'f'
            join d on d.oid = k.confrelid and k.confrelid <> k.conrelid where d.depth < 20)
      select name from d group by name order by max(depth), name""")
    return [r for r in rows.splitlines() if r]


def insertable_columns(table):
    """Columns that take a value (generated-always identity and generated columns are given one with OVERRIDING)."""
    s, t = table.split(".")
    return [r for r in local(f"""
      select quote_ident(column_name) from information_schema.columns
      where table_schema = '{s}' and table_name = '{t}' and is_generated = 'NEVER'
      order by ordinal_position""").splitlines() if r]


def load_table(ref, token, table, replace):
    cols = insertable_columns(table)
    have = api(ref, token, f"select count(*)::bigint as n from {table}")[0]["n"]
    if have and not replace:
        print(f"{table}: already holds {have} rows, skipped (use --replace)"); return 0
    if have:
        api(ref, token, f"truncate {table} cascade")
    collist = ", ".join(cols)
    proc = subprocess.Popen(LOCAL + ["-c", f"select row_to_json(x)::text from (select {collist} from {table}) x"],
                            stdout=subprocess.PIPE, text=True)
    sent, batch, size = 0, [], 0

    def flush():
        nonlocal sent, batch, size
        if not batch: return
        payload = "[" + ",".join(batch) + "]"
        api(ref, token, f"insert into {table} ({collist}) overriding system value "
                        f"select {collist} from json_populate_recordset(null::{table}, $j${payload}$j$::json)")
        sent += len(batch); batch, size = [], 0

    for line in proc.stdout:
        line = line.rstrip("\n")
        if "$j$" in line:
            raise SystemExit(f"{table}: a row contains the quote marker $j$")
        batch.append(line); size += len(line)
        if size >= BATCH_BYTES: flush()
    flush()
    if proc.wait() != 0:
        raise SystemExit(f"{table}: local read failed")
    api(ref, token, f"""do $$ declare s text; begin
      for s in select pg_get_serial_sequence('{table}', column_name) from information_schema.columns
               where table_schema || '.' || table_name = '{table}' and is_identity = 'YES' loop
        execute format('select setval(%L, coalesce((select max(%I) from {table}), 0) + 1, false)', s,
                       (select column_name from information_schema.columns where pg_get_serial_sequence('{table}', column_name) = s));
      end loop; end $$""")
    print(f"{table}: {sent} rows")
    return sent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", default="njpvfrceahkvnrduerkk")
    ap.add_argument("--schemas", default="meta,ref,core,legacy_spx")
    ap.add_argument("--migrations", action="store_true")
    ap.add_argument("--replace", action="store_true")
    a = ap.parse_args()
    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if not token:
        raise SystemExit("SUPABASE_ACCESS_TOKEN is not set")
    if a.migrations:
        exists = api(a.ref, token, "select count(*)::int as n from pg_namespace where nspname = 'legacy_spx'")[0]["n"]
        if not exists:
            api(a.ref, token, open(os.path.join(ROOT, "db/migrations/002_legacy_spx.sql")).read())
            print("applied 002_legacy_spx.sql")
        api(a.ref, token, "create table if not exists legacy_spx._superseded (table_name text not null, row_key jsonb not null, "
                          "old_row jsonb not null, seen_in text not null, primary key (table_name, row_key, seen_in))")
    total = 0
    for t in tables_in_order(a.schemas.split(",")):
        total += load_table(a.ref, token, t, a.replace)
    print(f"done: {total} rows")


if __name__ == "__main__":
    main()
