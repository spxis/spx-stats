#!/usr/bin/env python3
"""Rebuild the raw cache scripts/nwsl/fetch.py reads (CACHE/{season,team,template,playoffs,league}/<file>) from the files already archived on DS1,
so a season can be loaded again with the current parser without fetching what is already held.

  cache_from_archive.py CACHE_DIR            CACHE_DIR must be new or empty

Reads legacy_files.raw_archive through scripts/daily/ds1.sh (select only; NWSL_PSQL_READ, a command that runs SQL on stdin and prints rows, points it at
another database). Archive names are 'wikipedia-nwsl/<year>/<kind>/<file>'; a file named in two years is the same bytes and the first is kept. Nothing is
written to DS1. fetch.py fetches (one request every 2.5 s) only a page the cache lacks.

Then (the coordinating session, loading DS1):
  NWSL_CACHE=CACHE_DIR NWSL_RUN_DATE=<today> python3 -I scripts/nwsl/season.py YEAR [YEAR ...]
"""
import base64, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DS1 = os.path.join(HERE, "..", "daily", "ds1.sh")
QUERY = r"""
select name || E'\t' || replace(encode(data, 'base64'), E'\n', '') from legacy_files.raw_archive
where name ~ '^wikipedia-nwsl/[0-9]{4}/' order by name;
"""


def rows():
    cmd = os.environ["NWSL_PSQL_READ"].split() if os.environ.get("NWSL_PSQL_READ") else ["bash", DS1, "-q", "-At", "-f", "-"]
    p = subprocess.run(cmd, input=QUERY, text=True, capture_output=True)
    if p.returncode: sys.exit(p.stderr[-1500:])
    for line in p.stdout.splitlines():
        if "\t" in line: yield line.split("\t", 1)


def main(cache):
    if os.path.exists(cache) and os.listdir(cache): sys.exit(f"{cache} is not empty")
    n = skipped = 0
    for name, b64 in rows():
        rel = re.match(r"^wikipedia-nwsl/\d{4}/(.+)$", name).group(1)
        path = os.path.join(cache, rel)
        if os.path.exists(path): skipped += 1; continue
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f: f.write(base64.b64decode(b64))
        n += 1
    print(f"{n} files written to {cache} ({skipped} repeated names skipped)")


if __name__ == "__main__":
    if len(sys.argv) != 2: sys.exit(__doc__)
    main(os.path.expanduser(sys.argv[1]))
