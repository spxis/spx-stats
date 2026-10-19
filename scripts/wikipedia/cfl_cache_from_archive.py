#!/usr/bin/env python3
"""Rebuild the raw cache scripts/wikipedia/season.py reads (CACHE/season, team, template, greycup) from the files already archived on DS1,
so a season can be loaded again with the current parser without fetching anything.

  cfl_cache_from_archive.py CACHE_DIR            writes CACHE_DIR/{season,team,template,greycup}/<file>; CACHE_DIR must be new or empty

Reads legacy_files.raw_archive through scripts/daily/ds1.sh (select only; CFL_PSQL_READ, a command that runs SQL on stdin and prints rows, points it at
another database). Two archive layouts hold CFL files: 'wikipedia-cfl/<year>/<kind>/<file>' (seasons archived by season.py with CFL_ARCHIVE=raw_archive,
which includes the multi-season club pages) and 'wikipedia/2026-10-10/<kind>/<file>' (the first fetches, one folder for every league: only the CFL's
season, standings-template, club and Grey Cup files are taken). A file in both layouts is the same bytes; the first is kept. Nothing is written to DS1.

Then, for one season (the coordinating session, loading DS1):
  CFL_CACHE=CACHE_DIR CFL_BUNDLE=<any folder> CFL_ARCHIVE=raw_archive CFL_PSQL="bash scripts/daily/ds1.sh" python3 -I scripts/wikipedia/season.py load YEAR
"""
import base64, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DS1 = os.path.join(HERE, "..", "daily", "ds1.sh")
CLUBS = ("Ottawa_Rough_Riders|Toronto_Argonauts|Hamilton_Tiger-Cats|Winnipeg_Blue_Bombers|Saskatchewan_Roughriders|Edmonton_Eskimos|Edmonton_Elks|Calgary_Stampeders|BC_Lions|"
         "Montreal_Alouettes|Montreal_Concordes|Sacramento_Gold_Miners|Las_Vegas_Posse|Baltimore_|Shreveport_Pirates|Memphis_Mad_Dogs|San_Antonio_Texans|Birmingham_Barracudas|"
         "Ottawa_Renegades|Ottawa_Redblacks|Toronto_Argonauts|Montreal_Alouette|Oshawa|Regina")
QUERY = r"""
select name || E'\t' || replace(encode(data, 'base64'), E'\n', '') from legacy_files.raw_archive
where name ~ '^wikipedia-cfl/[0-9]{4}/(season|team|template|greycup)/'
   or (name ~ '^wikipedia/2026-10-10/(season|team|template|greycup)/'
       and (name ~ 'CFL|Grey_Cup' or name ~ '/[0-9]{4}_(%s)' or name ~ 'seasons|football'))
order by name;
""" % CLUBS


def rows():
    cmd = os.environ["CFL_PSQL_READ"].split() if os.environ.get("CFL_PSQL_READ") else ["bash", DS1, "-q", "-At", "-f", "-"]
    p = subprocess.run(cmd, input=QUERY, text=True, capture_output=True)
    if p.returncode: sys.exit(p.stderr[-1500:])
    for line in p.stdout.splitlines():
        if "\t" in line: yield line.split("\t", 1)


def main(cache):
    if os.path.exists(cache) and os.listdir(cache): sys.exit(f"{cache} is not empty")
    n = skipped = 0
    for name, b64 in rows():
        m = re.match(r"^wikipedia-cfl/\d{4}/(.+)$", name) or re.match(r"^wikipedia/2026-10-10/(.+)$", name)
        rel = m.group(1)
        path = os.path.join(cache, rel)
        if os.path.exists(path): skipped += 1; continue
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f: f.write(base64.b64decode(b64))
        n += 1
    print(f"{n} files written to {cache} ({skipped} repeated names skipped)")


if __name__ == "__main__":
    if len(sys.argv) != 2: sys.exit(__doc__)
    main(os.path.expanduser(sys.argv[1]))
