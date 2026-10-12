#!/usr/bin/env python3
"""Print an insert-only SQL file of core.brand_venue (migration 035) for production (Supabase MCP execute_sql, or psql).
Rows production already has are left alone (on conflict do nothing). The rows are read from a database that has run
db/build/176_venue_place.sql. Usage: python3 scripts/venue_place/to_sql.py [psql connection args]
(default: the local working copy, -h /tmp -p 55432 -U postgres -d spx_stats)."""
import csv, io, subprocess, sys

args = sys.argv[1:] or ["-h", "/tmp", "-p", "55432", "-U", "postgres", "-d", "spx_stats"]
q = lambda v: "null" if v == "" else "'" + v.replace("'", "''") + "'"
out = subprocess.run(
    ["psql", "-v", "ON_ERROR_STOP=1", "-q", *args, "-c",
     "copy (select venue_label, latitude, longitude, source_key, city, region, country_code, wikipedia_title "
     "from core.brand_venue order by venue_label, latitude, longitude) to stdout with csv"],
    check=True, capture_output=True, text=True).stdout
rows = list(csv.reader(io.StringIO(out)))
print("insert into core.brand_venue (venue_label, latitude, longitude, source_id, source_key, city, region, country_code, wikipedia_title) values")
print(",\n".join(
    f"({q(r[0])}, {r[1]}, {r[2]}, (select source_id from meta.source where code = 'wikidata'), {q(r[3])}, {q(r[4])}, {q(r[5])}, {q(r[6])}, {q(r[7])})"
    for r in rows))
print("on conflict (venue_label, latitude, longitude) do nothing;")
