#!/usr/bin/env python3
"""Print SQL that fills core.brand_venue_name and core.brand_venue_info (migration 044) on production, from a database that has
run db/build/193_venue_names.sql. Insert-only (on conflict do nothing); with --update the rows already there are overwritten
with the new values (the yearly refresh; rows of a name that has gone are left). Run the output with the Supabase MCP
execute_sql or psql. Usage: to_sql.py [--update] [psql connection args]   (default: PG* variables)."""
import csv, io, subprocess, sys

args = sys.argv[1:]
update = "--update" in args
args = [a for a in args if a != "--update"]
q = lambda v: "null" if v == "" else "'" + v.replace("'", "''") + "'"
n = lambda v: "null" if v == "" else v


def rows(sql):
    out = subprocess.run(["psql", "-v", "ON_ERROR_STOP=1", "-q", *args, "-c", f"copy ({sql}) to stdout with csv"],
                         check=True, capture_output=True, text=True).stdout
    return list(csv.reader(io.StringIO(out)))


src = lambda col: f"(select source_id from meta.source where code = '{col}')"
names = rows("select n.wikidata_id, n.name, n.from_year, n.until_year, n.is_current, s.code, n.source_key "
             "from core.brand_venue_name n join meta.source s using (source_id) order by 1, n.from_year nulls first, 2")
print("insert into core.brand_venue_name (wikidata_id, name, from_year, until_year, is_current, source_id, source_key) values")
print(",\n".join(f"({q(r[0])}, {q(r[1])}, {n(r[2])}, {n(r[3])}, {r[4] == 't'}, {src(r[5])}, {q(r[6])})" for r in names))
print("on conflict (wikidata_id, name) do " + ("update set from_year = excluded.from_year, until_year = excluded.until_year, is_current = excluded.is_current, "
      "source_id = excluded.source_id, source_key = excluded.source_key;" if update else "nothing;"))
info = rows("select wikidata_id, capacity, opened_year, closed_year, owner, surface, roof, address, source_key, wikipedia_key, wikipedia_fields "
            "from core.brand_venue_info order by 1")
print("insert into core.brand_venue_info (wikidata_id, capacity, opened_year, closed_year, owner, surface, roof, address, source_id, source_key, wikipedia_key, wikipedia_fields) values")
print(",\n".join(f"({q(r[0])}, {n(r[1])}, {n(r[2])}, {n(r[3])}, {q(r[4])}, {q(r[5])}, {q(r[6])}, {q(r[7])}, {src('wikidata')}, {q(r[8])}, {q(r[9])}, {q(r[10])})" for r in info))
print("on conflict (wikidata_id) do " + ("update set capacity = excluded.capacity, opened_year = excluded.opened_year, closed_year = excluded.closed_year, owner = excluded.owner, "
      "surface = excluded.surface, roof = excluded.roof, address = excluded.address, wikipedia_key = excluded.wikipedia_key, wikipedia_fields = excluded.wikipedia_fields;" if update else "nothing;"))
