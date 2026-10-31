"""Archive the keep-only files of John's SportsInteractive folder as raw bytes (ticket SPX-602, option A of docs/spx-extras-inventory.md).

What it does: copies the exact bytes of every ALLOWED file into legacy_files.raw_archive (name `spx-extras/<day>/<path under the folder>`),
and builds nothing: no legacy_spx_extras load, no core rows. The Dropbox copy is `dropbox_put.py --from-archive --source spx-extras`.

Selection is by an ALLOW list (ALLOW_DIRS, ALLOW_FILES below, from the inventory's keep-only areas and John's option A). A file that is not on it is
never stat-ed, opened or copied: it is only counted. Inside an allowed area a file whose path suggests member data, credentials, GeoIP or a database
backup (REFUSE_NAME, REFUSE_EXT) is REFUSED: listed by name, never opened. Zips and rars are archived as they are, never opened.
A file that is online-only in Dropbox (dataless, or a size that reads back differently), empty, a link, or changed while being read is skipped and
named; an empty placeholder is never archived as if it were the file.

Usage (from the repo root; paths and the day below are examples):
  python3 -I scripts/spx_extras/archive_keep.py                       dry run: changes nothing, reads nothing but file names and sizes
  python3 -I scripts/spx_extras/archive_keep.py --check-db            dry run that also reads DS1 (select only) and hashes the files, so it shows what a rerun adds
  python3 -I scripts/spx_extras/archive_keep.py --apply --date 2026-10-30     archive: one transaction per batch (about 40 MB), rerunnable
  python3 -I scripts/spx_extras/archive_keep.py --sql-dir DIR --date 2026-10-30   only write the batch .sql files, apply nothing
Options: --root DIR (the folder), --only PREFIX (repeatable: only an area whose label starts so), --target ds1|env (ds1: scripts/daily/ds1.sh to read and
scripts/mac/ds1-apply.sh --force to write; env: psql with PGHOST, PGPORT, PGUSER, PGDATABASE, PGPASSWORD, for a scratch database), --batch-mb, --chunk-mb, --max-file-mb.
Rerun: a file whose (path, sha256) is already archived under any day is skipped, so an interrupted run is simply run again with the same --date.
Exit code: 0 clean, 1 an error, 2 finished but some files were not available (online-only, unreadable, too big): fix and run again."""
import argparse, datetime, hashlib, os, re, subprocess, sys, tempfile, unicodedata

DEFAULT_ROOT = "~/Library/CloudStorage/Dropbox/Projects/SportsInteractive"
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
SOURCE = "spx-extras"
SF_DATALESS = 0x40000000   # macOS: the file's bytes are not on this disk (Dropbox online-only)

# Keep-only areas (docs/spx-extras-inventory.md) and the ESPN, BBC and other third-party pages SPX saved (John, 2026-10-28, option A: raw bytes).
# Everything else, including Data/GeoIP, Images, Backup, Apps, SPX4, SQL Scripts and the rest of Miscellaneous, is not on the list.
ALLOW_DIRS = [
    "Data/cbb", "Data/cbl", "Data/cfb", "Data/cfl", "Data/efl", "Data/fifa", "Data/games", "Data/gaming",
    "Data/Lahman Database", "Data/mlb", "Data/nba", "Data/nfl", "Data/nhl", "Data/pga", "Data/pub",
    "wwwroot extras/pub", "wwwroot extras/zip",
    "Miscellaneous/DTS", "Miscellaneous/scriptaculous-js-1.7.0",
]
# Miscellaneous holds member and business records next to the reference files, so only these exact names are allowed there.
ALLOW_FILES = [
    "Miscellaneous/Capitals.txt", "Miscellaneous/Countries.txt", "Miscellaneous/Countries.xlsx", "Miscellaneous/SPXISOCodes.txt",
    "Miscellaneous/TimeZones.txt", "Miscellaneous/ESPNPlayerMaps.txt", "Miscellaneous/SPXNBAScores2002-2006.csv",
    "Miscellaneous/Spx History.txt", "Miscellaneous/Spx History.doc", "Miscellaneous/SPX History.XLS",
    "Miscellaneous/TeamConferenceDivisionSeasons Worksheet.sql", "Miscellaneous/SPs.txt", "Miscellaneous/Changed SPs.txt",
    "Miscellaneous/DTS.txt", "Miscellaneous/Extract Sport Score Schedules.txt",
    "Miscellaneous/FAQ.doc", "Miscellaneous/Sportsia Diagrams.vsd", "Miscellaneous/Copy of Sportsia Diagrams.vsd",
    "Miscellaneous/Sportsia Documentation.doc", "Miscellaneous/Copy of Sportsia Documentation.doc",
    "Miscellaneous/StateDiagram.vsd", "Miscellaneous/SportsInteractive Pool Outline.doc",
]
MISC_LABEL = "Miscellaneous (reference files)"
# Refused even inside an allowed area, judged by name only (any folder or file name in the path).
REFUSE_NAME = re.compile(
    r"account|member|user|e-?mail|@|address|passw|pwd|credential|login|logon|connection|connstr|conn_?str|dsn|secret|token|api.?key"
    r"|wager(?!line)|geoip|geolite|maxmind|paypal|subscri|invoice|billing|payment|payout|forum|message|hosting|godaddy|netsol|registrar|customer",
    re.I)
REFUSE_EXT = (".mdf", ".ldf", ".bak", ".mdb", ".accdb", ".sqlite", ".sqlite3", ".db", ".pst", ".msg", ".eml", ".pem", ".key", ".pfx", ".kdbx")
JUNK = {".ds_store", "thumbs.db", "desktop.ini", ".dropbox", ".dropbox.attr"}


def nfc(s):
    return unicodedata.normalize("NFC", s)


def junk(name):
    return name.lower() in JUNK or name.startswith("~$") or name.startswith("._")


def refused(rel):
    """Why a path may not be archived, or None. Name only; the file is never opened."""
    if REFUSE_NAME.search(rel):
        return "name suggests " + REFUSE_NAME.search(rel).group(0).lower()
    if rel.lower().endswith(REFUSE_EXT):
        return "database, mail or key file type"
    return None


def area_of(rel):
    """The allow-list entry a relative path falls under, or None."""
    if rel in ALLOW_FILES:
        return MISC_LABEL
    for d in ALLOW_DIRS:
        if rel == d or rel.startswith(d + "/"):
            return d
    return None


def walk_names(root, sub):
    """Every file path (relative to root) below root/sub, by name only: nothing is stat-ed or opened. Links are not followed."""
    base = os.path.join(root, sub)
    for cur, dirs, files in os.walk(base, followlinks=False):
        dirs.sort()
        for f in sorted(files):
            yield nfc(os.path.relpath(os.path.join(cur, f), root))


def scan(root, only=()):
    """Classify every file under the three folders. Returns a dict of lists/counters; reads no file contents."""
    r = {"files": [], "refused": [], "empty": [], "not_local": [], "junk": 0, "links": [], "left_out": {}, "left_out_misc": []}
    for top in ("Data", "Miscellaneous", "wwwroot extras"):
        if not os.path.isdir(os.path.join(root, top)):
            continue
        for rel in walk_names(root, top):
            name = rel.rsplit("/", 1)[-1]
            area = area_of(rel)
            if area is None:
                key = "/".join(rel.split("/")[:2]) if top != "Miscellaneous" else "Miscellaneous"
                r["left_out"][key] = r["left_out"].get(key, 0) + 1
                if top == "Miscellaneous":
                    r["left_out_misc"].append(rel)
                continue
            if only and not any(area.startswith(o) for o in only):
                continue
            if junk(name):
                r["junk"] += 1
                continue
            why = refused(rel)
            if why:
                r["refused"].append((rel, why))
                continue
            path = find_real(root, rel)
            if path is None:
                r["not_local"].append((rel, "name not found on disk"))
                continue
            if os.path.islink(path):
                r["links"].append(rel)
                continue
            st = os.stat(path)
            if (getattr(st, "st_flags", 0) & SF_DATALESS) or (st.st_size > 0 and st.st_blocks == 0):
                r["not_local"].append((rel, "online-only in Dropbox"))
                continue
            if st.st_size == 0:
                r["empty"].append(rel)
                continue
            r["files"].append({"rel": rel, "path": path, "size": st.st_size, "mtime": st.st_mtime_ns, "area": area})
    return r


def find_real(root, rel):
    """The on-disk path of a normalised (NFC) relative name: the disk may hold the same name in another unicode form."""
    p = os.path.join(root, *rel.split("/"))
    if os.path.lexists(p):
        return p
    cur = root
    for part in rel.split("/"):
        try:
            names = os.listdir(cur)
        except OSError:
            return None
        hit = next((n for n in names if nfc(n) == part), None)
        if hit is None:
            return None
        cur = os.path.join(cur, hit)
    return cur


def sha_of(path, size, mtime):
    """sha256 of a file, read in pieces. Raises OSError when the file is not what the scan saw (shorter, longer, changed)."""
    h, n = hashlib.sha256(), 0
    with open(path, "rb") as f:
        while True:
            b = f.read(1 << 20)
            if not b:
                break
            n += len(b)
            h.update(b)
    st = os.stat(path)
    if n != size or st.st_size != size or st.st_mtime_ns != mtime:
        raise OSError(f"read {n} bytes, expected {size}, or the file changed while being read")
    return h.hexdigest()


def q(s):
    return s.replace("'", "''")


def archive_name(day, rel):
    return f"{SOURCE}/{day}/{rel}"


def write_file_sql(out, f, day, sha, chunk):
    """Append the statements that store one file: one insert for a small file, an insert plus appends for a big one, then a check in the same transaction."""
    name = q(archive_name(day, f["rel"]))
    size = f["size"]
    if size <= chunk:
        with open(f["path"], "rb") as fh:
            b = fh.read()
        if len(b) != size or hashlib.sha256(b).hexdigest() != sha:
            raise OSError("changed while being read")
        out.write(f"insert into legacy_files.raw_archive (name, saved_on, sha256, data) values ('{name}', '{day}', '{sha}', decode('{b.hex()}', 'hex')) "
                  f"on conflict (name) do update set saved_on = excluded.saved_on, sha256 = excluded.sha256, data = excluded.data "
                  f"where legacy_files.raw_archive.sha256 <> excluded.sha256;\n")
    else:
        out.write(f"delete from legacy_files.raw_archive where name = '{name}';\n")
        h, total, first = hashlib.sha256(), 0, True
        with open(f["path"], "rb") as fh:
            while True:
                b = fh.read(chunk)
                if not b:
                    break
                h.update(b)
                total += len(b)
                if first:
                    out.write(f"insert into legacy_files.raw_archive (name, saved_on, sha256, data) values ('{name}', '{day}', '{sha}', decode('{b.hex()}', 'hex'));\n")
                    first = False
                else:
                    out.write(f"update legacy_files.raw_archive set data = data || decode('{b.hex()}', 'hex') where name = '{name}';\n")
        if total != size or h.hexdigest() != sha:
            raise OSError("changed while being read")
    out.write(f"do $v$ begin if not exists (select 1 from legacy_files.raw_archive where name = '{name}' and sha256 = '{sha}' and length(data) = {size} "
              f"and encode(sha256(data), 'hex') = '{sha}') then raise exception 'spx-extras check failed for {name}'; end if; end $v$;\n")


class Target:
    """Where the archive is: DS1 (the project's own scripts, which find the host and read the password from the keychain) or a database named by PG* variables."""
    def __init__(self, kind):
        self.kind = kind

    def query(self, sql):
        if self.kind == "ds1":
            cmd = ["bash", os.path.join(REPO, "scripts/daily/ds1.sh"), "-At", "-F", "\t", "-c", sql]
        else:
            cmd = ["psql", "-X", "-At", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c", sql]
        p = subprocess.run(cmd, capture_output=True, text=True)
        if p.returncode:
            sys.exit("reading the archive failed: " + p.stderr.strip()[-400:])
        return p.stdout

    def apply(self, path):
        if self.kind == "ds1":
            cmd = ["bash", os.path.join(REPO, "scripts/mac/ds1-apply.sh"), "--force", path]
        else:
            cmd = ["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-1", "-f", path]
        p = subprocess.run(cmd, capture_output=True, text=True)
        tail = (p.stdout + p.stderr).strip().splitlines()[-6:]
        return p.returncode, "\n".join(tail)

    def existing(self):
        rows = self.query(f"select name, sha256 from legacy_files.raw_archive where name like '{SOURCE}/%'").splitlines()
        have = set()
        for line in rows:
            name, sha = line.split("\t")
            m = re.match(rf"^{SOURCE}/\d{{4}}-\d\d-\d\d/(.+)$", name)
            if m:
                have.add((m.group(1), sha))
        return have


def mb(n):
    return f"{n / 1e6:,.1f} MB"


def report(res, files, skipped, too_big, args):
    by = {}
    for f in files:
        a = by.setdefault(f["area"], [0, 0])
        a[0] += 1
        a[1] += f["size"]
    print(f"folder: {args.root_label}")
    print(f"\nWOULD ARCHIVE under {SOURCE}/{args.date}/ (allow list only):")
    for a in sorted(by):
        print(f"  {a:42s} {by[a][0]:6,d} files {mb(by[a][1]):>12s}")
    tf, tb = sum(v[0] for v in by.values()), sum(v[1] for v in by.values())
    print(f"  {'TOTAL':42s} {tf:6,d} files {mb(tb):>12s}")
    if skipped is not None:
        print(f"  already in the archive with the same sha256 (skipped): {skipped[0]:,d} files {mb(skipped[1])}")
    print(f"\nNOT AVAILABLE LOCALLY (online-only in Dropbox; never archived): {len(res['not_local'])}")
    for rel, why in res["not_local"][:40]:
        print(f"  {rel}  [{why}]")
    print(f"EMPTY FILES (0 bytes, not archived): {len(res['empty'])}")
    for rel in res["empty"]:
        print(f"  {rel}")
    print(f"TOO BIG for one row (over {args.max_file_mb} MB): {len(too_big)}")
    for f in too_big:
        print(f"  {f['rel']}  {mb(f['size'])}")
    print(f"\nREFUSED by name inside allowed areas (never opened): {len(res['refused'])}")
    for rel, why in res["refused"]:
        print(f"  {rel}  [{why}]")
    if res["links"]:
        print(f"LINKS (not followed): {len(res['links'])}")
    print(f"JUNK (.DS_Store and the like, not archived): {res['junk']}")
    lo = res["left_out"]
    print(f"\nLEFT OUT, not on the allow list (counted by name only, never touched): {sum(lo.values()):,d} files")
    for k in sorted(lo):
        print(f"  {k}: {lo[k]:,d}")
    if res["left_out_misc"]:
        print("  Miscellaneous names left out:")
        for rel in res["left_out_misc"]:
            print(f"    {'(name withheld: it suggests member or business data)' if REFUSE_NAME.search(rel) else rel}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default=DEFAULT_ROOT)
    ap.add_argument("--date", help="the day in the archive name (YYYY-MM-DD); required with --apply and --sql-dir")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--sql-dir", help="write the batch files here and apply nothing")
    ap.add_argument("--check-db", action="store_true", help="dry run that reads the archive (select only) and shows what a rerun adds")
    ap.add_argument("--target", choices=["ds1", "env"], default="ds1")
    ap.add_argument("--only", action="append", default=[])
    ap.add_argument("--batch-mb", type=float, default=40)
    ap.add_argument("--chunk-mb", type=float, default=16)
    ap.add_argument("--max-file-mb", type=float, default=512)
    args = ap.parse_args()
    if (args.apply or args.sql_dir) and not args.date:
        ap.error("--date is required with --apply and --sql-dir (use the same one on every run)")
    if args.date and not re.match(r"^\d{4}-\d\d-\d\d$", args.date):
        ap.error("--date must be YYYY-MM-DD")
    args.date = args.date or datetime.date.today().isoformat()
    root = os.path.expanduser(args.root)
    args.root_label = args.root
    if not os.path.isdir(root):
        sys.exit(f"no such folder: {args.root}")
    batch, chunk, maxf = int(args.batch_mb * 1e6), int(args.chunk_mb * 1e6), int(args.max_file_mb * 1e6)

    res = scan(root, tuple(args.only))
    files = [f for f in res["files"] if f["size"] <= maxf]
    too_big = [f for f in res["files"] if f["size"] > maxf]
    target = Target(args.target)
    skipped = None
    hashes = {}
    todo = files
    if args.check_db or args.apply:
        have = target.existing()
        todo, skipped = [], [0, 0]
        for f in files:
            try:
                sha = sha_of(f["path"], f["size"], f["mtime"])
            except OSError as e:
                res["not_local"].append((f["rel"], f"unreadable: {e}"))
                continue
            hashes[f["rel"]] = sha
            if (f["rel"], sha) in have:
                skipped[0] += 1
                skipped[1] += f["size"]
            else:
                todo.append(f)
    if not (args.apply or args.sql_dir):
        report(res, todo, skipped, too_big, args)
        print("\nDRY RUN: nothing was written." + ("" if args.check_db else " (add --check-db to see what a rerun would skip)"))
        return 0
    if not args.apply:   # --sql-dir without --apply: hash now, nothing is read from a database
        for f in todo:
            try:
                hashes[f["rel"]] = sha_of(f["path"], f["size"], f["mtime"])
            except OSError as e:
                res["not_local"].append((f["rel"], f"unreadable: {e}"))
        todo = [f for f in todo if f["rel"] in hashes]

    outdir = args.sql_dir or tempfile.mkdtemp(prefix="spx-extras-")
    os.makedirs(outdir, exist_ok=True)
    batches, cur, cur_bytes = [], [], 0
    for f in todo:
        if cur and (cur_bytes + f["size"] > batch):
            batches.append(cur)
            cur, cur_bytes = [], 0
        cur.append(f)
        cur_bytes += f["size"]
    if cur:
        batches.append(cur)
    print(f"{len(todo):,d} files ({mb(sum(f['size'] for f in todo))}) in {len(batches)} batches; skipped as already archived: {skipped[0] if skipped else 0}")
    done_files = done_bytes = 0
    for i, b in enumerate(batches, 1):
        path = os.path.join(outdir, f"spx-extras-{args.date}-{i:04d}.sql")
        try:
            with open(path, "w") as out:
                for f in b:
                    write_file_sql(out, f, args.date, hashes[f["rel"]], chunk)
        except OSError as e:
            res["not_local"].append((f["rel"], f"unreadable: {e}"))
            os.remove(path)
            print(f"batch {i}: a file changed while being read ({f['rel']}); run again")
            continue
        if args.apply:
            rc, tail = target.apply(path)
            os.remove(path)
            if rc:
                print(f"batch {i}/{len(batches)} FAILED (nothing of it was kept; run the same command again):\n{tail}")
                return 1
        done_files += len(b)
        done_bytes += sum(f["size"] for f in b)
        print(f"batch {i}/{len(batches)} {'applied' if args.apply else 'written ' + path}: {done_files:,d} files {mb(done_bytes)} so far", flush=True)
    if not args.apply:
        print(f"\nWROTE {len(batches)} batch files to {outdir}; nothing was applied.")
    else:
        os.rmdir(outdir) if not os.listdir(outdir) else None
        print(f"\nDONE: {done_files:,d} files {mb(done_bytes)} archived under {SOURCE}/{args.date}/" if done_files else "\nNOTHING TO ARCHIVE: every available file is already in the archive.")
    left = len(res["not_local"]) + len(too_big)
    if left:
        print(f"NOT ARCHIVED: {len(res['not_local'])} not available locally or unreadable, {len(too_big)} too big. Run the dry run to see them.")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
