"""Write the SportsLogos.Net logo files the site serves from its own address into web/public/team-logos/sl/, from the bytes DS1 keeps
(legacy_sportslogos.logo -> legacy_files.raw_archive). The files are not committed to git: a deploy that builds on a Mac runs this first
(scripts/mac/deploy-prebuilt.sh), so they ship inside the Vercel deployment as static files (no function, no CPU, immutable cache).
Usage: export_hosted.py [<web dir>]      default: web/ of this checkout. Reads PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE (read only).
Only logos used by a franchise_brand row are written, each checked against its sha256. Prints the count and the total bytes."""
import hashlib, os, subprocess, sys

web = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "web")
sql = ("select l.hosted_path, l.sha256, encode(a.data, 'hex') from legacy_sportslogos.logo l join legacy_files.raw_archive a on a.name = l.archive_name "
       "where exists (select 1 from core.franchise_brand b where b.logo_url = l.hosted_path) order by 1")
p = subprocess.run(["psql", "-X", "-At", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c", sql], capture_output=True, text=True)
if p.returncode:
    raise SystemExit(p.stderr[-500:])
total = n = 0
for line in p.stdout.splitlines():
    path, sha, hexdata = line.split("\t")
    data = bytes.fromhex(hexdata)
    if hashlib.sha256(data).hexdigest() != sha:
        raise SystemExit(f"{path}: archived bytes do not match their sha256")
    if not path.startswith("/team-logos/sl/") or ".." in path:
        raise SystemExit(f"{path}: not a path under /team-logos/sl/")
    dest = os.path.join(web, "public", path.lstrip("/"))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(dest, "wb").write(data)
    total += len(data)
    n += 1
print(f"wrote {n} logo files, {total} bytes, to {os.path.join(web, 'public', 'team-logos', 'sl')}")
