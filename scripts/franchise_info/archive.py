"""Keep the exact bytes of each raw file in legacy_files.raw_archive.
Usage: archive.py <raw dir> <YYYY-MM-DD> <file>...  (files relative to the raw dir)
Name stored: franchise-info/<day>/<file>. Reads PGHOST/PGPORT/PGUSER/PGDATABASE; replaces a row of the same name."""
import hashlib, subprocess, sys
raw, day, files = sys.argv[1], sys.argv[2], sys.argv[3:]
for f in files:
    b = open(f"{raw}/{f}", "rb").read()
    sql = (f"insert into legacy_files.raw_archive (name, saved_on, sha256, data) values "
           f"('franchise-info/{day}/{f}', '{day}', '{hashlib.sha256(b).hexdigest()}', decode('{b.hex()}', 'hex')) "
           f"on conflict (name) do update set saved_on = excluded.saved_on, sha256 = excluded.sha256, data = excluded.data;")
    p = subprocess.run(["psql", "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"], input=sql, text=True, capture_output=True)
    if p.returncode: raise SystemExit(f"{f}: {p.stderr[-500:]}")
    print("archived", f, len(b))
