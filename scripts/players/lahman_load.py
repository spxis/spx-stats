#!/usr/bin/env python3
"""The Lahman Baseball Database (SABR, CC BY-SA 3.0) -> legacy_lahman, raw as it came (every column text).

  lahman_load.py <pylahman wheel>

The database reached us as the parquet files inside the pylahman wheel (PyPI, MIT-licensed packaging of SABR's
tables, 1871-2025). The wheel itself goes to legacy_files.raw_archive first, from its own bytes (pg_read_binary_file,
so the stored sha256 is the file's: the wheel must sit where the local server can read it). Rerunnable: the schema
is dropped and refilled."""
import io, os, subprocess, sys, tempfile, zipfile
import pandas as pd
CONN = ["psql", "-h", "/tmp", "-p", "55432", "-U", "postgres", "-d", "spx_stats", "-X", "-q", "-v", "ON_ERROR_STOP=1"]
TABLES = ["People", "Batting", "BattingPost", "Pitching", "PitchingPost", "Teams", "CollegePlaying", "Schools"]
SAVED = "2026-10-11"

def psql(sql, stdin=None):
    subprocess.run(CONN + ["-c", sql], input=stdin, check=True, text=True)

def main(wheel):
    wheel = os.path.abspath(wheel)
    name = "lahman/%s/%s" % (SAVED, os.path.basename(wheel))
    psql("insert into legacy_files.raw_archive (name, saved_on, sha256, data) select '%s', '%s', encode(sha256(b), 'hex'), b "
         "from (select pg_read_binary_file('%s') b) x where not exists (select 1 from legacy_files.raw_archive where name = '%s')"
         % (name, SAVED, wheel, name))
    z = zipfile.ZipFile(wheel)
    psql("drop schema if exists legacy_lahman cascade; create schema legacy_lahman; "
         "comment on schema legacy_lahman is 'Lahman Baseball Database (SABR), CC BY-SA 3.0, as it came: every column text.'")
    for t in TABLES:
        df = pd.read_parquet(io.BytesIO(z.read("pylahman/data/%s.parquet" % t)))
        cols = list(df.columns)
        psql("create table legacy_lahman.%s (%s)" % (t.lower(), ", ".join('"%s" text' % c.lower() for c in cols)))
        buf = io.StringIO()
        df.astype(object).where(df.notna(), None).to_csv(buf, index=False, header=False, na_rep="")
        # an empty field is NULL; the csv writer quotes what needs it
        psql("\\copy legacy_lahman.%s from stdin with (format csv, null '')" % t.lower(), stdin=buf.getvalue())
        print(t, len(df), flush=True)

if __name__ == "__main__":
    main(sys.argv[1])
