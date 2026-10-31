"""python3 -I scripts/spx_extras/test_archive_keep.py: archive_keep.py on a small fake folder.
Checks: the allow list (a file outside it is never stat-ed or opened), refusals by name, empty / online-only / link / junk files, the dry run changes
nothing, and, against a scratch Postgres in Docker (container spx-extras-test on port 7741, removed at the end), a real run, a rerun that adds nothing
(even on another day), a changed file that is archived again alone, a file stored in several chunks, and the stored bytes equal the files'.
Without Docker the database part is skipped and says so."""
import hashlib, os, shutil, subprocess, sys, tempfile, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import archive_keep as ak

SCRIPT = os.path.join(HERE, "archive_keep.py")
PORT, NAME = "7741", "spx-extras-test"


def put(root, rel, data=b"x"):
    p = os.path.join(root, *rel.split("/"))
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "wb") as f:
        f.write(data)
    return p


def make_folder(root):
    big = os.urandom(5000) + b"tail"
    put(root, "Data/efl/2004-regular/data/efl-2004-schedules.csv", b"#,a,b\n1,2,3\n")
    put(root, "Data/games/2005-regular/batch/games-scores-bbc.html", b"<html>bbc</html>")
    put(root, "Data/games/2005-regular/archive.rar", big)                       # kept as it is, never opened as an archive
    put(root, "Data/pub/AlternateNames.csv", "a,b\n\xe9,'\n".encode("utf-8"))
    put(root, "Data/pub/O'Brien é.html", b"quote and accent in the name")
    put(root, "Data/pub/tblForumMessages-20030729.csv", b"MEMBER DATA")             # refused
    put(root, "Data/pub/users list.csv", b"MEMBER DATA")                             # refused
    put(root, "Data/pub/db.bak", b"MEMBER DATA")                                     # refused (file type)
    put(root, "Data/games/wagerresults.txt", b"MEMBER DATA")                         # refused
    put(root, "Data/games/odds/games-odds-wagerline.html", b"betting line page")    # allowed: a saved odds page
    put(root, "Data/mlb/empty.csv", b"")                                             # empty placeholder
    put(root, "Data/mlb/.DS_Store", b"junk")
    put(root, "Data/GeoIP/GeoIPCountryWhois.csv", b"GEOIP")                          # outside the allow list
    put(root, "Data/unlisted/file.txt", b"NOT LISTED")                               # outside the allow list
    put(root, "Miscellaneous/Capitals.txt", b"Ottawa")
    put(root, "Miscellaneous/Addresses.txt", b"MEMBER DATA")                         # outside the allow list
    put(root, "Miscellaneous/Emails/mail.txt", b"MEMBER DATA")                       # outside the allow list
    put(root, "Miscellaneous/DTS/Export CFL.dts", b"package")
    put(root, "Miscellaneous/DTS/connection string.txt", b"MEMBER DATA")             # refused
    put(root, "wwwroot extras/zip/MLB2003Teams.zip", b"PK\x03\x04fake")
    put(root, "wwwroot extras/other/file.txt", b"NOT LISTED")                        # outside the allow list
    os.symlink(os.path.join(root, "Data/efl"), os.path.join(root, "Data/cbb"))      # a link in an allowed place is not followed
    return big


def check_scan(root):
    opened, statted = [], []
    real_stat, real_open = os.stat, open
    os.stat = lambda p, *a, **k: (statted.append(str(p)), real_stat(p, *a, **k))[1]
    ak.open = lambda p, *a, **k: (opened.append(str(p)), real_open(p, *a, **k))[1]
    try:
        res = ak.scan(root)
    finally:
        os.stat = real_stat
        del ak.open
    rels = sorted(f["rel"] for f in res["files"])
    assert "Data/efl/2004-regular/data/efl-2004-schedules.csv" in rels and "Data/games/2005-regular/archive.rar" in rels
    assert "Data/games/odds/games-odds-wagerline.html" in rels and "Miscellaneous/Capitals.txt" in rels and "Miscellaneous/DTS/Export CFL.dts" in rels
    assert "Data/pub/O'Brien é.html" in rels and "wwwroot extras/zip/MLB2003Teams.zip" in rels
    refused = sorted(r for r, _ in res["refused"])
    assert refused == ["Data/games/wagerresults.txt", "Data/pub/db.bak", "Data/pub/tblForumMessages-20030729.csv", "Data/pub/users list.csv",
                       "Miscellaneous/DTS/connection string.txt"], refused
    assert res["empty"] == ["Data/mlb/empty.csv"] and res["junk"] == 1 and not res["not_local"]
    assert res["left_out"]["Data/GeoIP"] == 1 and res["left_out"]["Data/unlisted"] == 1 and res["left_out"]["wwwroot extras/other"] == 1
    assert "Miscellaneous/Addresses.txt" in res["left_out_misc"]
    touched = " ".join(opened + statted)
    for never in ("GeoIP", "unlisted", "Addresses.txt", "Emails", "wwwroot extras/other", "tblForum", "users list", "db.bak", "wagerresults", "connection string"):
        assert never not in touched, f"{never} was stat-ed or opened"
    assert not opened, "the scan must not open any file"
    print("ok scan: allow list, refusals, empty, junk; nothing outside the list or refused was touched")


def check_not_local(root):
    target = os.path.join(root, "Data/efl/2004-regular/data/efl-2004-schedules.csv")
    real_stat = os.stat

    class Fake:
        def __init__(self, st):
            self._st = st
            self.st_flags = getattr(st, "st_flags", 0) | ak.SF_DATALESS

        def __getattr__(self, k):
            return getattr(self._st, k)

    os.stat = lambda p, *a, **k: Fake(real_stat(p, *a, **k)) if str(p) == target else real_stat(p, *a, **k)
    try:
        res = ak.scan(root)
    finally:
        os.stat = real_stat
    assert [r for r, _ in res["not_local"]] == ["Data/efl/2004-regular/data/efl-2004-schedules.csv"], res["not_local"]
    assert all(f["rel"] != "Data/efl/2004-regular/data/efl-2004-schedules.csv" for f in res["files"])
    print("ok online-only file is reported and never archived")


def run(args, env=None):
    e = dict(os.environ)
    e.update(env or {})
    return subprocess.run([sys.executable, "-I", SCRIPT] + args, capture_output=True, text=True, env=e)


def check_dry_run(root):
    r = run(["--root", root])
    assert r.returncode == 0, r.stderr
    assert "DRY RUN: nothing was written" in r.stdout and "NOT AVAILABLE LOCALLY (online-only in Dropbox; never archived): 0" in r.stdout
    assert "REFUSED by name" in r.stdout and "Data/pub/users list.csv" in r.stdout and "TOTAL" in r.stdout
    assert "MEMBER DATA" not in r.stdout
    r2 = run(["--root", root, "--apply"])
    assert r2.returncode != 0 and "--date" in r2.stderr
    print("ok dry run prints the report and writes nothing; --apply needs --date")


def psql(sql, env):
    p = subprocess.run(["psql", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], capture_output=True, text=True, env=env)
    assert p.returncode == 0, p.stderr
    return p.stdout.strip()


def check_database(root, big):
    if not shutil.which("docker") or subprocess.run(["docker", "info"], capture_output=True).returncode:
        print("SKIPPED database part: Docker is not running")
        return
    subprocess.run(["docker", "rm", "-f", NAME], capture_output=True)
    p = subprocess.run(["docker", "run", "-d", "--name", NAME, "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "-p", f"127.0.0.1:{PORT}:5432", "postgres:17-alpine"],
                       capture_output=True, text=True)
    assert p.returncode == 0, p.stderr
    env = dict(os.environ, PGHOST="127.0.0.1", PGPORT=PORT, PGUSER="postgres", PGDATABASE="postgres")
    try:
        for _ in range(60):
            if subprocess.run(["psql", "-X", "-Atc", "select 1"], capture_output=True, env=env).returncode == 0:
                break
            time.sleep(1)
        psql("create schema legacy_files; create table legacy_files.raw_archive (name text primary key, saved_on date not null, sha256 text not null, data bytea not null)", env)
        base = ["--root", root, "--target", "env", "--chunk-mb", "0.001", "--batch-mb", "0.004"]   # 1000-byte chunks; the 5004-byte file is chunked
        r = run(base + ["--apply", "--date", "2026-10-30"], env)
        assert r.returncode == 0, r.stdout + r.stderr
        n = psql("select count(*) from legacy_files.raw_archive", env)
        assert n == "9", n
        assert "batches" in r.stdout and "DONE: 9 files" in r.stdout, r.stdout
        names = psql("select name from legacy_files.raw_archive order by name", env)
        for never in ("GeoIP", "Addresses", "Emails", "users list", "Forum", "db.bak", "wagerresults", "connection string", "unlisted", "other/", "empty.csv", "DS_Store"):
            assert never not in names, never
        assert "spx-extras/2026-10-30/Data/pub/O'Brien é.html" in names.splitlines()
        # stored bytes and hashes equal the files' (the chunked file included)
        rows = psql("select name, sha256, length(data), encode(sha256(data),'hex') from legacy_files.raw_archive order by name", env).splitlines()
        for line in rows:
            name, sha, ln, sha_db = line.split("|")
            rel = name.split("/", 2)[2]
            data = open(os.path.join(root, *rel.split("/")), "rb").read()
            assert sha == sha_db == hashlib.sha256(data).hexdigest() and int(ln) == len(data), name
        assert any(l.startswith("spx-extras/2026-10-30/Data/games/2005-regular/archive.rar|") and "|5004|" in l for l in rows)
        assert psql("select count(*) from legacy_files.raw_archive where saved_on <> '2026-10-30'", env) == "0"
        # rerun, same day and another day: nothing is added, nothing is rewritten
        before = psql("select md5(string_agg(name || sha256 || saved_on, ',' order by name)) from legacy_files.raw_archive", env)
        for day in ("2026-10-30", "2026-11-02"):
            r = run(base + ["--apply", "--date", day], env)
            assert r.returncode == 0 and "0 files" in r.stdout and "skipped as already archived: 9" in r.stdout, r.stdout + r.stderr
        assert psql("select md5(string_agg(name || sha256 || saved_on, ',' order by name)) from legacy_files.raw_archive", env) == before
        c = run(base + ["--check-db"], env)
        assert "already in the archive with the same sha256 (skipped): 9 files" in c.stdout, c.stdout
        # one file changes: only it is archived again; a refused name appearing later is still refused
        put(root, "Miscellaneous/Capitals.txt", b"Ottawa, Washington")
        put(root, "Data/pub/new members.csv", b"MEMBER DATA")
        r = run(base + ["--apply", "--date", "2026-10-30"], env)
        assert r.returncode == 0 and "DONE: 1 files" in r.stdout, r.stdout
        assert psql("select count(*) from legacy_files.raw_archive", env) == "9"        # same name, same day: replaced
        assert psql("select encode(data,'escape') from legacy_files.raw_archive where name like '%Capitals.txt'", env) == "Ottawa, Washington"
        assert "new members" not in psql("select string_agg(name, ',') from legacy_files.raw_archive", env)
        # a failing batch keeps nothing of itself and the run says so (the check inside the batch raises)
        psql("create or replace function legacy_files.boom() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$; "
             "create trigger boom before insert on legacy_files.raw_archive for each row execute function legacy_files.boom()", env)
        put(root, "Data/pub/another.csv", b"later")
        r = run(base + ["--apply", "--date", "2026-10-30"], env)
        assert r.returncode == 1 and "FAILED" in r.stdout, r.stdout
        assert psql("select count(*) from legacy_files.raw_archive", env) == "9"
        print("ok database: archived 9 files byte for byte, rerun adds nothing, a changed file alone is redone, a failed batch keeps nothing")
    finally:
        subprocess.run(["docker", "rm", "-f", NAME], capture_output=True)


def main():
    root = tempfile.mkdtemp(prefix="spx-extras-test-")
    try:
        big = make_folder(root)
        check_scan(root)
        check_not_local(root)
        check_dry_run(root)
        check_database(root, big)
    finally:
        shutil.rmtree(root, ignore_errors=True)
        subprocess.run(["docker", "rm", "-f", NAME], capture_output=True)
    print("ok")


if __name__ == "__main__":
    main()
