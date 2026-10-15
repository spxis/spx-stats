"""Write the SportsLogos.Net logo files the site serves from its own address into <web dir>/public/team-logos/sl/, from the bytes DS1 keeps
(legacy_sportslogos.logo -> legacy_files.raw_archive). The files are not committed to git: a deploy that builds on a Mac runs this first
(scripts/mac/lib/hosted-logos.sh, from deploy-prebuilt.sh and ds1-preview.sh), so they ship inside the Vercel deployment or the preview image as
static files (no function, no CPU, immutable cache).
Usage: export_hosted.py [<web dir>]      default: web/ of this checkout. Reads PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE (read only).
Every logo a core.franchise_brand row points at under /team-logos/ must come out: each is checked against its sha256, and the run stops
(exit 1, nothing half-written is kept) if a referenced file has no archived bytes, or its bytes do not match. Prints the count and total bytes."""
import hashlib, os, subprocess, sys

web = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "web")
PSQL = os.environ.get("PSQL", "psql")


def query(sql):
    p = subprocess.run([PSQL, "-X", "-At", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c", sql], capture_output=True, text=True)
    if p.returncode:
        raise SystemExit("export_hosted: psql failed: " + p.stderr.strip()[-400:])
    return [line for line in p.stdout.splitlines() if line]


referenced = {r for r in query("select distinct logo_url from core.franchise_brand where logo_url like '/team-logos/%' order by 1")}
for path in referenced:
    if not path.startswith("/team-logos/sl/") or ".." in path or path.count("/") != 3:
        raise SystemExit(f"export_hosted: {path}: not a file path under /team-logos/sl/")
rows = query("select l.hosted_path, l.sha256, encode(a.data, 'hex') from legacy_sportslogos.logo l "
             "join legacy_files.raw_archive a on a.name = l.archive_name where l.hosted_path like '/team-logos/sl/%' order by 1")
files = {}
for line in rows:
    path, sha, hexdata = line.split("\t")
    if path not in referenced:
        continue
    data = bytes.fromhex(hexdata)
    if hashlib.sha256(data).hexdigest() != sha:
        raise SystemExit(f"export_hosted: {path}: the archived bytes do not match their sha256")
    files[path] = data
missing = sorted(referenced - set(files))
if missing:
    raise SystemExit("export_hosted: referenced by core.franchise_brand but not in DS1's archive: " + ", ".join(missing))
dest_dir = os.path.join(web, "public", "team-logos", "sl")
os.makedirs(dest_dir, exist_ok=True)
for path, data in files.items():
    open(os.path.join(web, "public", path.lstrip("/")), "wb").write(data)
print(f"wrote {len(files)} logo files, {sum(len(d) for d in files.values())} bytes, to {dest_dir}")
