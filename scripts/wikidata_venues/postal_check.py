#!/usr/bin/env python3
"""Check the venue postal codes load.py stored (legacy_wikidata_venues.venue.postal_code, Wikidata P281) with @johnmorrisdotca/address-plus,
and write the verdict to postal_checked (the code in its standard form) and postal_problem (why a code was refused), migration 058.
Usage: postal_check.py <work dir> [--sql-out FILE]     (the work dir is a scratch folder; npm installs the pinned package there)
Reads PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD through psql: each venue's state or province comes from core.brand_venue, so run it
after load.py and before db/build/193_venue_names.sql. With --sql-out the update is written to FILE instead of run (apply it with
scripts/mac/ds1-apply.sh). Rerunnable. A refused code is never repaired; 193_venue_names.sql logs it in meta.data_issue."""
import json, os, shutil, subprocess, sys

argv = sys.argv[1:]
sql_out = None
if "--sql-out" in argv:
    i = argv.index("--sql-out"); sql_out = os.path.expanduser(argv[i + 1]); del argv[i:i + 2]
work = os.path.expanduser(argv[0])


def psql(sql):
    p = subprocess.run(["psql", "-v", "ON_ERROR_STOP=1", "-At", "-q", "-f", "-"], input=sql, text=True, capture_output=True)
    if p.returncode:
        raise SystemExit(p.stderr)
    return p.stdout


rows = json.loads(psql("""
select coalesce(json_agg(json_build_object('qid', v.qid, 'raw', v.postal_code, 'region', b.region, 'country', b.country_code) order by v.qid), '[]')
from legacy_wikidata_venues.venue v
left join (select distinct on (source_key) source_key, region, country_code from core.brand_venue order by source_key, venue_label) b on b.source_key = v.qid
where v.postal_code is not null"""))
os.makedirs(work, exist_ok=True)
json.dump(rows, open(f"{work}/postal_in.json", "w"))
here = os.path.dirname(os.path.abspath(__file__))
for f in ("postal_check.mjs", "package.json"):
    shutil.copy(f"{here}/{f}", work)   # ESM resolves the package from beside the script
if not os.path.isdir(f"{work}/node_modules/@johnmorrisdotca/address-plus"):
    subprocess.run(["npm", "install", "--no-audit", "--no-fund", "--ignore-scripts"], check=True, cwd=work)
subprocess.run(["node", "postal_check.mjs", "postal_in.json", "postal_out.json"], check=True, cwd=work)
out = json.load(open(f"{work}/postal_out.json"))

q = lambda v: "null" if v is None else "'" + str(v).replace("'", "''") + "'"
sql = ["begin;", "update legacy_wikidata_venues.venue set postal_checked = null, postal_problem = null where postal_code is not null;"]
for o in out:
    sql.append(f"update legacy_wikidata_venues.venue set postal_checked = {q(o['checked'])}, postal_problem = {q(o['problem'])} where qid = {q(o['qid'])};")
sql.append("commit;")
if sql_out:
    open(sql_out, "w").write("\n".join(sql) + "\n")
    print("wrote", sql_out)
else:
    psql("\n".join(sql))
    print("updated", len(out))
for o in out:
    if not o["checked"]:
        print("refused", o["qid"], o["problem"])
