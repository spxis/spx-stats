"""Keep the exact bytes of every file of a raw folder in legacy_files.raw_archive (replaces rows of the same name).
Usage: archive_raw.py <name prefix> <raw dir> <YYYY-MM-DD>     e.g. archive_raw.py wikipedia-staff ~/spx-raw/wikipedia_staff/2026-10-12 2026-10-12
Name stored: <prefix>/<day>/<path relative to the raw dir>. Reads PGHOST/PGPORT/PGUSER/PGDATABASE."""
import hashlib, os, subprocess, sys
prefix, raw, day = sys.argv[1], os.path.expanduser(sys.argv[2]), sys.argv[3]
for root, _, files in sorted(os.walk(raw)):
    for f in sorted(files):
        path = os.path.join(root, f)
        rel = os.path.relpath(path, raw)
        b = open(path, "rb").read()
        sql = (f"insert into legacy_files.raw_archive (name, saved_on, sha256, data) values "
               f"('{prefix}/{day}/{rel}', '{day}', '{hashlib.sha256(b).hexdigest()}', decode('{b.hex()}', 'hex')) "
               f"on conflict (name) do update set saved_on = excluded.saved_on, sha256 = excluded.sha256, data = excluded.data;")
        p = subprocess.run(["psql", "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"], input=sql, text=True, capture_output=True)
        if p.returncode: raise SystemExit(f"{rel}: {p.stderr[-500:]}")
        print("archived", rel, len(b))
