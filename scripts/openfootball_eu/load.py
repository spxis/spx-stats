#!/usr/bin/env python3
"""Load the raw files of scripts/openfootball_eu/fetch.py into legacy_openfootball. DS1 only (the schema is made here, not by a migration: production never holds legacy_*).
Usage: load.py <raw dir> [--sql-out FILE]     e.g. load.py ~/Projects/backups/spx-stats/raw/openfootball/2026-10-25 --sql-out load.sql
With --sql-out the SQL is written to FILE (apply it with scripts/mac/ds1-apply.sh, dry run first); without it, PG* variables run it.
Rerunnable: the three tables are emptied and filled again from the files.
Raw means as published: every played match as the file spells it (club names untouched), a fixture with no score is not stored, a cancelled one goes in eu_cancelled.
Which club a name is, and which division a file is, are worked out by db/build/227_soccer_europe_openfootball.sql from db/seed/soccer_club_eu.csv and soccer_league_eu.csv.
A line the parser cannot read is printed as `not read:` and stops the load (nothing is guessed)."""
import hashlib, json, os, re, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import openfootball as OF

argv = sys.argv[1:]
sql_out = None
if "--sql-out" in argv:
    i = argv.index("--sql-out"); sql_out = os.path.expanduser(argv[i + 1]); del argv[i:i + 2]
raw = os.path.expanduser(argv[0])
q = lambda v: "null" if v is None else "'" + str(v).replace("'", "''") + "'"
n = lambda v: "null" if v is None else str(v)
bool_ = lambda v: "null" if v is None else ("true" if v else "false")

# a file's path -> season (the year it starts), tier (the number in the file name, or fr1 / fr2) and country pyramid
FILES = [
    (r"^england/archive/1990s/(\d{4})-\d\d/([1-4])-[a-z0-9]+\.txt$", "england"),
    (r"^england/(\d{4})-\d\d/([1-5])-[a-z0-9]+\.txt$", "england"),
    (r"^deutschland/(\d{4})-\d\d/([1-3])-[a-z0-9]+\.txt$", "germany"),
    (r"^espana/(\d{4})-\d\d/([1-2])-[a-z0-9]+\.txt$", "spain"),
    (r"^italy/(\d{4})-\d\d/([1-2])-[a-z0-9]+\.txt$", "italy"),
    (r"^europe/france/(\d{4})-\d\d_fr([12])\.txt$", "france"),
]
manifest = json.load(open(os.path.join(raw, "MANIFEST.json")))
files = []
for root, _, names in os.walk(raw):
    for f in names:
        rel = os.path.relpath(os.path.join(root, f), raw)
        for pat, system in FILES:
            m = re.match(pat, rel)
            if m:
                files.append((system, int(m.group(2)), int(m.group(1)), rel))
files.sort()

out = ["""create schema if not exists legacy_openfootball;
comment on schema legacy_openfootball is 'openfootball club-league files as published (CC0 1.0): england, deutschland, espana, italy and europe/france. Loaded by scripts/openfootball_eu/load.py; built by db/build/227.';
create table if not exists legacy_openfootball.eu_file (system_key text not null, tier smallint not null, season smallint not null, path text primary key, commit_id text, title text,
  header_teams integer, header_matches integer, n_matches integer not null, n_unplayed integer not null, n_cancelled integer not null, sha256 text not null);
create table if not exists legacy_openfootball.eu_match (system_key text not null, tier smallint not null, season smallint not null, seq integer not null, stage text not null,
  match_date date not null, kickoff time, team1 text not null, team2 text not null, score1 smallint, score2 smallint, aet boolean not null, pens1 smallint, pens2 smallint,
  s90_1 smallint, s90_2 smallint, ht1 smallint, ht2 smallint, tag text, line text not null, primary key (system_key, tier, season, seq));
create table if not exists legacy_openfootball.eu_cancelled (system_key text not null, tier smallint not null, season smallint not null, seq integer not null, stage text not null,
  match_date date not null, team1 text not null, team2 text not null, tag text not null, primary key (system_key, tier, season, seq));
delete from legacy_openfootball.eu_cancelled; delete from legacy_openfootball.eu_match; delete from legacy_openfootball.eu_file;"""]


def batches(table, cols, rows, size=400):
    for i in range(0, len(rows), size):
        out.append(f"insert into {table} ({', '.join(cols)}) values\n" + ",\n".join(rows[i:i + size]) + ";")


file_rows, match_rows, canc_rows = [], [], []
bad = 0
total = {"matches": 0, "unplayed": 0, "cancelled": 0}
for system, tier, season, rel in files:
    data = open(os.path.join(raw, rel), "rb").read()
    text = data.decode("utf-8")
    repo = rel.split("/")[0]
    ms, unread, unplayed, cancelled = OF.parse_file(text, season)
    for u in unread:
        print("not read:", rel, u.strip()[:100], file=sys.stderr); bad += 1
    title = re.search(r"^=\s*(.+?)\s*$", text, re.M)
    ht = re.search(r"^#\s*Teams\s+(\d+)", text, re.M)
    hm = re.search(r"^#\s*Matches\s+(\d+)", text, re.M)
    file_rows.append(f"({q(system)}, {tier}, {season}, {q(rel)}, {q(manifest[repo]['commit'])}, {q(title.group(1) if title else None)}, {n(int(ht.group(1)) if ht else None)}, "
                     f"{n(int(hm.group(1)) if hm else None)}, {len(ms)}, {len(unplayed)}, {len(cancelled)}, {q(hashlib.sha256(data).hexdigest())})")
    for seq, m in enumerate(ms, 1):
        match_rows.append(f"({q(system)}, {tier}, {season}, {seq}, {q(m['stage'])}, {q(m['date'])}, {q(m['time'])}, {q(m['team1'])}, {q(m['team2'])}, {n(m['score1'])}, {n(m['score2'])}, "
                          f"{bool_(m['aet'])}, {n(m['pens1'])}, {n(m['pens2'])}, {n(m['s90_1'])}, {n(m['s90_2'])}, {n(m['ht1'])}, {n(m['ht2'])}, {q(m['tag'])}, {q(m['raw'])})")
    for seq, c in enumerate(cancelled, 1):
        canc_rows.append(f"({q(system)}, {tier}, {season}, {seq}, {q(c['stage'])}, {q(c['date'])}, {q(c['team1'])}, {q(c['team2'])}, {q(c['tag'])})")
    total["matches"] += len(ms); total["unplayed"] += len(unplayed); total["cancelled"] += len(cancelled)
if bad:
    raise SystemExit(f"{bad} lines not read; nothing written")

batches("legacy_openfootball.eu_file", ["system_key", "tier", "season", "path", "commit_id", "title", "header_teams", "header_matches", "n_matches", "n_unplayed", "n_cancelled", "sha256"], file_rows)
batches("legacy_openfootball.eu_match", ["system_key", "tier", "season", "seq", "stage", "match_date", "kickoff", "team1", "team2", "score1", "score2", "aet", "pens1", "pens2",
                                         "s90_1", "s90_2", "ht1", "ht2", "tag", "line"], match_rows)
batches("legacy_openfootball.eu_cancelled", ["system_key", "tier", "season", "seq", "stage", "match_date", "team1", "team2", "tag"], canc_rows)
sql = "\n".join(out) + "\n"
print(f"files {len(files)}, matches {total['matches']}, unplayed (not stored) {total['unplayed']}, cancelled {total['cancelled']}", file=sys.stderr)
if sql_out:
    open(sql_out, "w", encoding="utf-8").write(sql)
    print("wrote", sql_out, len(sql), "bytes", file=sys.stderr)
else:
    p = subprocess.run(["psql", "-v", "ON_ERROR_STOP=1", "-q", "-1", "-f", "-"], input=sql, text=True, capture_output=True)
    if p.returncode:
        raise SystemExit(p.stderr[-800:])
    print("loaded", file=sys.stderr)
