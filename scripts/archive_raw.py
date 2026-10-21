"""Keep the exact bytes of every file of a raw folder in legacy_files.raw_archive (replaces rows of the same name).
Usage: archive_raw.py <name prefix> <raw dir> <YYYY-MM-DD> [--sql-out FILE]     e.g. archive_raw.py wikipedia-staff ~/Projects/backups/spx-stats/raw/wikipedia_staff/2026-10-12 2026-10-12
Name stored: <prefix>/<day>/<path relative to the raw dir>. Reads PGHOST/PGPORT/PGUSER/PGDATABASE. With --sql-out the inserts are written to FILE instead of run (apply it with scripts/mac/ds1-apply.sh)."""
import hashlib, os, subprocess, sys
argv = sys.argv[1:]
sql_out = None
if "--sql-out" in argv:
    i = argv.index("--sql-out"); sql_out = os.path.expanduser(argv[i + 1]); del argv[i:i + 2]
prefix, raw, day = argv[0], os.path.expanduser(argv[1]), argv[2]
out = open(sql_out, "w") if sql_out else None
for root, _, files in sorted(os.walk(raw)):
    for f in sorted(files):
        path = os.path.join(root, f)
        rel = os.path.relpath(path, raw)
        b = open(path, "rb").read()
        name = f"{prefix}/{day}/{rel}".replace("'", "''")
        sql = (f"insert into legacy_files.raw_archive (name, saved_on, sha256, data) values "
               f"('{name}', '{day}', '{hashlib.sha256(b).hexdigest()}', decode('{b.hex()}', 'hex')) "
               f"on conflict (name) do update set saved_on = excluded.saved_on, sha256 = excluded.sha256, data = excluded.data;")
        if out:
            out.write(sql + "\n")
            print("wrote", rel, len(b))
            continue
        p = subprocess.run(["psql", "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"], input=sql, text=True, capture_output=True)
        if p.returncode: raise SystemExit(f"{rel}: {p.stderr[-500:]}")
        print("archived", rel, len(b))
