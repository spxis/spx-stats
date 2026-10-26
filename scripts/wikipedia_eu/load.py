#!/usr/bin/env python3
"""Load the raw files of scripts/wikipedia_eu/fetch.py into legacy_wikipedia_europe. DS1 only (the schema is made here, not by a migration: production never holds legacy_*).
Usage: load.py <raw dir> [--sql-out FILE]     e.g. load.py ~/Projects/backups/spx-stats/raw/wikipedia_europe/2026-10-25 --sql-out load.sql
With --sql-out the SQL is written to FILE (apply it with scripts/mac/ds1-apply.sh, dry run first); without it, PG* variables run it.
Rerunnable: the tables are emptied and filled again from the files.
Raw means as published: the final league table of each season article as scripts/wikipedia_eu/standings.py reads it (a name as the article shows it, the article the
club's link leads to after redirects, the bracketed marks), and the Wikidata item (CC0) of every club article. Which club a name is, is worked out by
db/build/228_soccer_europe_wikipedia.sql from db/seed/soccer_club_eu.csv. A season whose article has no league table is printed as `no table:` and stored without rows."""
import glob, gzip, json, os, re, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import standings as S

argv = sys.argv[1:]
sql_out = None
if "--sql-out" in argv:
    i = argv.index("--sql-out"); sql_out = os.path.expanduser(argv[i + 1]); del argv[i:i + 2]
raw = os.path.expanduser(argv[0])
q = lambda v: "null" if v is None else "'" + str(v).replace("'", "''") + "'"
n = lambda v: "null" if v is None else str(v)

norm, redir, qid = {}, {}, {}
for path in sorted(glob.glob(raw + "/wikidata/pageprops-*.json")):
    d = json.load(open(path, encoding="utf-8"))["query"]
    norm.update({x["from"]: x["to"] for x in d.get("normalized", [])})
    redir.update({x["from"]: x["to"] for x in d.get("redirects", [])})
    for p in d["pages"].values():
        if p.get("pageprops", {}).get("wikibase_item"):
            qid[p["title"]] = p["pageprops"]["wikibase_item"]


def resolve(title):
    """(article after redirects, Wikidata item or None) of a title as a table links it."""
    t = norm.get(title, title)
    for _ in range(5):
        if t in redir:
            t = redir[t]
    return t, qid.get(t)


articles, rows, nodata = [], [], []
for path in sorted(glob.glob(raw + "/season/*/*.json.gz")):
    league = path.split("/")[-2]
    season = int(os.path.basename(path)[:4])
    a = json.load(gzip.open(path, "rt", encoding="utf-8"))
    tables = S.standings(a)
    t = S.league_table(a)
    articles.append((league, season, a["title"], a["revid"], a["pageid"], len(tables), t["label"] if t else None))
    if not t:
        print("no table:", league, season, a["title"], file=sys.stderr); nodata.append((league, season)); continue
    for r in t["rows"]:
        title, item = resolve(r["team_link"]) if r["team_link"] else (None, None)
        rows.append((league, season, r, title, item))

out = ["""create schema if not exists legacy_wikipedia_europe;
comment on schema legacy_wikipedia_europe is 'English Wikipedia season articles of the European top divisions: the final league table of each (CC BY-SA 4.0), and the Wikidata item (CC0) of each club. Loaded by scripts/wikipedia_eu/load.py; built by db/build/228.';
create table if not exists legacy_wikipedia_europe.article (league_code text not null, season smallint not null, title text not null, revid bigint, pageid bigint, n_tables smallint not null, table_label text,
  primary key (league_code, season));
create table if not exists legacy_wikipedia_europe.standing (league_code text not null, season smallint not null, pos smallint, team_shown text not null, team_link text, team_title text, team_qid text,
  marks text, played smallint, wins smallint, draws smallint, losses smallint, gf smallint, ga smallint, gd smallint, gr numeric, points smallint, ppg numeric, qualification text);
delete from legacy_wikipedia_europe.standing; delete from legacy_wikipedia_europe.article;"""]


def batches(table, cols, vals, size=400):
    for i in range(0, len(vals), size):
        out.append(f"insert into {table} ({', '.join(cols)}) values\n" + ",\n".join(vals[i:i + size]) + ";")


batches("legacy_wikipedia_europe.article", ["league_code", "season", "title", "revid", "pageid", "n_tables", "table_label"],
        [f"({q(l)}, {s}, {q(t)}, {n(r)}, {n(p)}, {nt}, {q(lab)})" for (l, s, t, r, p, nt, lab) in articles])
batches("legacy_wikipedia_europe.standing", ["league_code", "season", "pos", "team_shown", "team_link", "team_title", "team_qid", "marks", "played", "wins", "draws", "losses", "gf", "ga", "gd",
                                             "gr", "points", "ppg", "qualification"],
        [f"({q(l)}, {s}, {n(r['pos'])}, {q(r['team_shown'])}, {q(r['team_link'])}, {q(t)}, {q(i)}, {q(','.join(r['marks']) or None)}, {n(r['played'])}, {n(r['wins'])}, {n(r['draws'])}, "
         f"{n(r['losses'])}, {n(r['gf'])}, {n(r['ga'])}, {n(r['gd'])}, {n(r['gr'])}, {n(r['points'])}, {n(r['ppg'])}, {q(r['qualification'])})" for (l, s, r, t, i) in rows])
sql = "\n".join(out) + "\n"
print(f"articles {len(articles)}, without a table {len(nodata)}, standing rows {len(rows)}, club articles {len({r[3] for r in rows if r[3]})}", file=sys.stderr)
if sql_out:
    open(sql_out, "w", encoding="utf-8").write(sql)
    print("wrote", sql_out, len(sql), "bytes", file=sys.stderr)
else:
    p = subprocess.run(["psql", "-v", "ON_ERROR_STOP=1", "-q", "-1", "-f", "-"], input=sql, text=True, capture_output=True)
    if p.returncode:
        raise SystemExit(p.stderr[-800:])
    print("loaded", file=sys.stderr)
