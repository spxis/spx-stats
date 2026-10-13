#!/usr/bin/env python3
"""Load the raw files of scripts/mls/fetch.py into legacy_mls. DS1 only (the schema is made here, not by a migration: production never holds legacy_*).
Usage: load.py <raw dir> [--sql-out FILE]     e.g. load.py ~/Projects/backups/spx-stats/raw/mls/2026-10-13 --sql-out load.sql
With --sql-out the SQL is written to FILE (apply it with scripts/mac/ds1-apply.sh, dry run first); without it, PG* variables run it.
Rerunnable: every legacy_mls table is emptied and filled again from the files.
Raw means as published: openfootball lines as parsed by openfootball.py, Wikipedia match boxes as parsed by wikibox.py, the season articles'
tables as parsed by season.py. The only things worked out here are the club a name or link belongs to (the club's English Wikipedia article after
redirects is its key: a renamed club is one club) and the scope of a match box (league, or another competition's section of the article).
A name that cannot be placed is printed as `unplaced:` and left with a null club, never guessed."""
import gzip, json, os, re, subprocess, sys, unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import openfootball as OF
import season as S
import wikibox as B

argv = sys.argv[1:]
sql_out = None
if "--sql-out" in argv:
    i = argv.index("--sql-out"); sql_out = os.path.expanduser(argv[i + 1]); del argv[i:i + 2]
raw = os.path.expanduser(argv[0])
q = lambda v: "null" if v is None else "'" + str(v).replace("'", "''") + "'"
n = lambda v: "null" if v is None else str(v)
bool_ = lambda v: "null" if v is None else ("true" if v else "false")
js = lambda v: q(json.dumps(v, ensure_ascii=False, sort_keys=True)) + "::jsonb"


def fold(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "", s)


def gz(path):
    return json.load(gzip.open(path, "rt", encoding="utf-8"))


# ------------------------------------------------------------------ Wikipedia titles -> redirect target and Wikidata item
norm, redir, pages = {}, {}, {}
import glob
for path in sorted(glob.glob(raw + "/wikidata/pageprops-*.json")):
    d = json.load(open(path, encoding="utf-8"))["query"]
    norm.update({x["from"]: x["to"] for x in d.get("normalized", [])})
    redir.update({x["from"]: x["to"] for x in d.get("redirects", [])})
    pages.update({p["title"]: p for p in d["pages"].values()})


def resolve(title):
    """(article after redirects, Wikidata item or None) of a title as a link spells it."""
    if not title:
        return None, None
    t = norm.get(title, title)
    seen = 0
    while t in redir and seen < 5:
        t = redir[t]; seen += 1
    pg = pages.get(t)
    return t, (pg.get("pageprops", {}).get("wikibase_item") if pg else None)


# ------------------------------------------------------------------ the seasons
seasons = {}
for path in sorted(glob.glob(raw + "/wikipedia/season/*.json.gz")):
    year = int(os.path.basename(path)[:4])
    seasons[year] = gz(path)
years = sorted(seasons)

club_title = {}     # club key (resolved article) -> its Wikidata item
alias = {}          # folded name -> club key
era_names = {}      # (club key, year) -> set of names the season article shows


def add_alias(name, key):
    f = fold(re.sub(r"\s*\([^)]*\)\s*$", "", name or ""))
    if f and f not in alias:
        alias[f] = key


SEASON_TITLE = re.compile(r"^\d{4} (.+) season$")


def club_of_link(link, shown=None):
    t, qid = resolve(link)
    if t is None:
        return None
    m = SEASON_TITLE.match(t)
    if m:     # a table that links the club's own season article ("2004 D.C. United season"): the club is the one that name belongs to
        k = alias.get(fold(re.sub(r"\s*\([^)]*\)\s*$", "", m.group(1)))) or alias.get(fold(shown or ""))
        if k:
            return k
        t, qid = m.group(1), None
    club_title.setdefault(t, qid)
    add_alias(t, t)
    if shown:
        add_alias(shown, t)
    return t


stadium_rows, standing_rows, leader_rows, info_rows = [], [], [], []
for y in years:
    sd = seasons[y]
    for team, shown, st, st_shown in S.season_teams(sd):
        k = club_of_link(team, shown)
        era_names.setdefault((k, y), set()).add(shown)
        stk, stq = resolve(st) if st else (None, None)
        stadium_rows.append((y, k, shown, stk, st_shown, stq))
    for tbl in S.standings(sd):
        for r in tbl["rows"]:
            k = club_of_link(r["team_link"], r["team_shown"])
            era_names.setdefault((k, y), set()).add(r["team_shown"])
            standing_rows.append((y, tbl["kind"], k, r))
    for (cat, rank, player, plink, clink, cshown, val) in S.leaders(sd):
        k = club_of_link(clink, cshown) if clink else None
        leader_rows.append((y, cat, "", rank, player, plink, k, cshown, val))
    for (award, player, plink, clink, cshown) in S.awards(sd):
        k = club_of_link(clink, cshown) if clink else None
        leader_rows.append((y, "award", award, 1, player, plink, k, cshown, None))
    for key, v in S.infobox(sd["wikitext"]).items():
        info_rows.append((y, key, v))

# names the openfootball file and the match boxes use that the season tables do not
MANUAL = {"cd chivas": "chivas usa", "impact de montreal": "montreal impact", "new york rb": "new york red bulls", "metrostars": "ny/nj metrostars",
          "orlando city": "orlando city sc", "seattle sounders": "seattle sounders fc", "vancouver whitecaps": "vancouver whitecaps fc",
          "los angeles galaxy": "la galaxy", "kansas city wizards": "sporting kansas city", "houston dynamo": "houston dynamo fc",
          "columbus crew sc": "columbus crew", "chicago fire fc": "chicago fire", "ny nj metrostars": "ny/nj metrostars", "nynj metrostars": "ny/nj metrostars",
          "dc united": "d.c. united", "whitecaps": "vancouver whitecaps fc", "vancouver": "vancouver whitecaps fc",
          "new york new jersey metrostars": "ny/nj metrostars", "new york/new jersey metrostars": "ny/nj metrostars", "ny/nj metrostars": "ny/nj metrostars"}
by_folded_title = {fold(t): t for t in club_title}
for a_, b_ in MANUAL.items():
    fb = fold(b_)
    if fb in alias and fold(a_) not in alias:
        alias[fold(a_)] = alias[fb]
    elif fb in by_folded_title and fold(a_) not in alias:
        alias[fold(a_)] = by_folded_title[fb]

# a name with or without its FC / SC / CF ("Atlanta United" and "Atlanta United FC")
SUFFIX = re.compile(r"(fc|sc|cf)$")
AMBIGUOUS = {"losangeles", "newyork"}       # a city with two clubs: never a club's short name by itself
for f_, k_ in list(alias.items()):
    if SUFFIX.sub("", f_) not in AMBIGUOUS:
        alias.setdefault(SUFFIX.sub("", f_), k_)

unplaced = {}


def place(text, link=None, year=None):
    """The club key of a team as a box or the openfootball file names it, or None. `year` settles a bare "Los Angeles": the Galaxy until LAFC arrived in 2018."""
    if link:
        t, _ = resolve(link)
        if t in club_title:
            return t
    f = fold(re.sub(r"\s*\([^)]*\)\s*$", "", text or ""))
    if f == "losangeles" and year:
        return alias.get("lagalaxy" if year < 2018 else "losangelesfc")
    k = alias.get(f) or alias.get(SUFFIX.sub("", f))
    if k is None:
        unplaced[text] = unplaced.get(text, 0) + 1
    return k


# ------------------------------------------------------------------ openfootball
ofm, cancelled_total = [], 0
for y in range(2005, 2026):
    p = f"{raw}/openfootball/{y}_mls.txt"
    if not os.path.exists(p):
        continue
    ms, un, canc = OF.parse_file(open(p, encoding="utf-8").read(), y)
    cancelled_total += len(canc)
    for u in un:
        if re.search(r"\sv\s", u) and not re.search(r"\d+-\d+", u):
            continue                      # a fixture not played yet (the 2025 file stops part way)
        print("not read:", y, u.strip()[:100], file=sys.stderr)
    for seq, m in enumerate(ms, 1):
        ofm.append((y, seq, m, place(m["team1"]), place(m["team2"])))

# ------------------------------------------------------------------ the club-season articles
EXCLUDE = re.compile(r"open cup|friendl|pre-?season|non-competitive|mid-?season|concacaf|champions|leagues cup|campeones|canadian championship|invitational|"
                     r"international|tour\b|exhibition|all-star|super liga|superliga|us open|u\.s\. open|copa|supporters' shield \(|reserve|academy|summer", re.I)
boxes_out, page_rows, seen_pages = [], [], set()
for path in sorted(glob.glob(raw + "/wikipedia/club/*.json.gz")):
    d = gz(path)
    base = os.path.basename(path)
    year = int(base[:4])
    if (year, d["title"]) in seen_pages:      # two file names for one article (a table linking a redirect, another a resolved name)
        continue
    seen_pages.add((year, d["title"]))
    article_club = None
    # the article's club: the club in this season's table whose folded key is in the file name
    mt = SEASON_TITLE.match(d["title"])
    if mt:
        article_club = alias.get(fold(re.sub(r"\s*\([^)]*\)\s*$", "", mt.group(1))))
    page_rows.append((year, article_club, base, d["title"], d["revid"], d["pageid"]))
    for seq, b in enumerate(B.boxes(d["wikitext"] or "", year), 1):
        scope = "other" if EXCLUDE.search(" ".join(b["path"])) else "league"
        c1, c2 = place(b["team1"]["text"], b["team1"]["link"], year), place(b["team2"]["text"], b["team2"]["link"], year)
        if scope == "league" and (c1 is None or c2 is None):
            scope = "other"               # a side that is not an MLS club of any season: another competition
        boxes_out.append((year, article_club, seq, b, scope, c1, c2))
# the season article itself holds the playoff match boxes of many seasons (and the MLS Cup), under the pseudo club "Season article"
for y in years:
    for seq, b in enumerate(B.boxes(seasons[y]["wikitext"] or "", y), 1):
        scope = "other" if EXCLUDE.search(" ".join(b["path"])) else "league"
        c1, c2 = place(b["team1"]["text"], b["team1"]["link"], y), place(b["team2"]["text"], b["team2"]["link"], y)
        if scope == "league" and (c1 is None or c2 is None):
            scope = "other"
        boxes_out.append((y, "Season article", seq, b, scope, c1, c2))
for y in years:
    page_rows.append((y, None, f"season/{y}", seasons[y]["title"], seasons[y]["revid"], seasons[y]["pageid"]))

# ------------------------------------------------------------------ SQL
out = []


def batches(table, cols, rows, size=300):
    for i in range(0, len(rows), size):
        out.append(f"insert into {table} ({', '.join(cols)}) values\n" + ",\n".join(rows[i:i + size]) + ";")


out.append("""create schema if not exists legacy_mls;
comment on schema legacy_mls is 'Major League Soccer datasets as published: openfootball/world (CC0), English Wikipedia season and club-season articles (CC BY-SA 4.0), Wikidata item ids (CC0).';
create table if not exists legacy_mls.club (club_key text primary key, qid text);
create table if not exists legacy_mls.club_name (club_key text not null, year smallint not null, name text not null, primary key (club_key, year, name));
create table if not exists legacy_mls.page (year smallint not null, club_key text, file text not null, title text not null, revid bigint, pageid bigint, primary key (file));
create table if not exists legacy_mls.of_match (year smallint not null, seq integer not null, stage text not null, match_date date not null, kickoff time, team1 text not null, team2 text not null,
  club1 text, club2 text, score1 smallint, score2 smallint, aet boolean not null, pens1 smallint, pens2 smallint, score90 text, ht text, line text not null, primary key (year, seq));
create table if not exists legacy_mls.wp_box (year smallint not null, club_key text, seq integer not null, section text not null, scope text not null, round text, match_date date, date_raw text, kickoff text,
  team1 text, link1 text, club1 text, team2 text, link2 text, club2 text, score_raw text, score1 smallint, score2 smallint, aet boolean, golden boolean, so boolean, series boolean,
  pens1 smallint, pens2 smallint, result text, stadium text, stadium_link text, stadium_qid text, location text, attendance integer, primary key (year, club_key, seq));
create table if not exists legacy_mls.wp_stadium (year smallint not null, club_key text not null, shown text, stadium_title text, stadium_shown text, stadium_qid text);
create table if not exists legacy_mls.wp_standing (year smallint not null, kind text not null, club_key text, pos smallint, team_shown text, marker text, played smallint, wins smallint,
  shootout_wins smallint, draws smallint, losses smallint, gf smallint, ga smallint, gd smallint, points smallint, ppg text, qualification text, cells jsonb);
create table if not exists legacy_mls.wp_leader (year smallint not null, category text not null, label text not null, rank smallint not null, player text not null, player_link text,
  player_qid text, club_key text, club_shown text, value smallint);
create table if not exists legacy_mls.wp_info (year smallint not null, key text not null, value text, primary key (year, key));
delete from legacy_mls.of_match; delete from legacy_mls.wp_box; delete from legacy_mls.wp_stadium; delete from legacy_mls.wp_standing;
delete from legacy_mls.wp_leader; delete from legacy_mls.wp_info; delete from legacy_mls.page; delete from legacy_mls.club_name; delete from legacy_mls.club;""")

batches("legacy_mls.club", ["club_key", "qid"], [f"({q(k)}, {q(v)})" for k, v in sorted(club_title.items())])
batches("legacy_mls.club_name", ["club_key", "year", "name"], [f"({q(k)}, {y}, {q(nm)})" for (k, y), names in sorted(era_names.items(), key=lambda x: (str(x[0][0]), x[0][1])) for nm in sorted(names)])
batches("legacy_mls.page", ["year", "club_key", "file", "title", "revid", "pageid"], [f"({y}, {q(k)}, {q(f)}, {q(t)}, {n(r)}, {n(p)})" for (y, k, f, t, r, p) in page_rows])
batches("legacy_mls.of_match", ["year", "seq", "stage", "match_date", "kickoff", "team1", "team2", "club1", "club2", "score1", "score2", "aet", "pens1", "pens2", "score90", "ht", "line"],
        [f"({y}, {s}, {q(m['stage'])}, {q(m['date'])}, {q(m['time'])}, {q(m['team1'])}, {q(m['team2'])}, {q(c1)}, {q(c2)}, {n(m['score1'])}, {n(m['score2'])}, "
         f"{bool_(m['aet'])}, {n(m['pens1'])}, {n(m['pens2'])}, {q(m['score90'])}, {q(m['ht'])}, {q(m['raw'])})" for (y, s, m, c1, c2) in ofm])
rows = []
for (y, k, seq, b, scope, c1, c2) in boxes_out:
    stq = resolve(b["stadium"]["link"])[1] if b["stadium"]["link"] else None
    rows.append(f"({y}, {q(k)}, {seq}, {q(' > '.join(b['path']))}, {q(scope)}, {q(b['round'])}, {q(b['date'])}, {q(b['date_raw'])}, {q(b['time'])}, {q(b['team1']['text'])}, "
                f"{q(b['team1']['link'])}, {q(c1)}, {q(b['team2']['text'])}, {q(b['team2']['link'])}, {q(c2)}, {q(b['score_raw'])}, {n(b['score1'])}, {n(b['score2'])}, "
                f"{bool_(b['aet'])}, {bool_(b['golden'])}, {bool_(b['so'])}, {bool_(b['series'])}, {n(b['pens1'])}, {n(b['pens2'])}, {q(b['result'])}, "
                f"{q(b['stadium']['text'])}, {q(b['stadium']['link'])}, {q(stq)}, {q(b['location'])}, {n(b['attendance'])})")
batches("legacy_mls.wp_box", ["year", "club_key", "seq", "section", "scope", "round", "match_date", "date_raw", "kickoff", "team1", "link1", "club1", "team2", "link2", "club2", "score_raw",
                              "score1", "score2", "aet", "golden", "so", "series", "pens1", "pens2", "result", "stadium", "stadium_link", "stadium_qid", "location", "attendance"], rows)
batches("legacy_mls.wp_stadium", ["year", "club_key", "shown", "stadium_title", "stadium_shown", "stadium_qid"],
        [f"({y}, {q(k)}, {q(sh)}, {q(st)}, {q(ss)}, {q(sq)})" for (y, k, sh, st, ss, sq) in stadium_rows])
batches("legacy_mls.wp_standing", ["year", "kind", "club_key", "pos", "team_shown", "marker", "played", "wins", "shootout_wins", "draws", "losses", "gf", "ga", "gd", "points", "ppg",
                                   "qualification", "cells"],
        [f"({y}, {q(kind)}, {q(k)}, {n(r['pos'])}, {q(r['team_shown'])}, {q(r['marker'])}, {n(r['played'])}, {n(r['wins'])}, {n(r['shootout_wins'])}, {n(r['draws'])}, {n(r['losses'])}, "
         f"{n(r['gf'])}, {n(r['ga'])}, {n(r['gd'])}, {n(r['points'])}, {q(r['ppg'])}, {q(r['qualification'])}, {js(r['cells'])})" for (y, kind, k, r) in standing_rows])
batches("legacy_mls.wp_leader", ["year", "category", "label", "rank", "player", "player_link", "player_qid", "club_key", "club_shown", "value"],
        [f"({y}, {q(cat)}, {q(lab)}, {rk}, {q(pl)}, {q(pk)}, {q(resolve(pk)[1] if pk else None)}, {q(ck)}, {q(cs)}, {n(v)})" for (y, cat, lab, rk, pl, pk, ck, cs, v) in leader_rows])
batches("legacy_mls.wp_info", ["year", "key", "value"], [f"({y}, {q(k)}, {q(v)})" for (y, k, v) in info_rows])

sql = "\n".join(out) + "\n"
print(f"clubs {len(club_title)}, seasons {len(years)}, openfootball matches {len(ofm)} (cancelled {cancelled_total}), club-season pages {len(glob.glob(raw + '/wikipedia/club/*.json.gz'))}, "
      f"boxes {len(boxes_out)} (league {sum(1 for x in boxes_out if x[4] == 'league')}), standing rows {len(standing_rows)}, leaders {len(leader_rows)}", file=sys.stderr)
for t, c in sorted(unplaced.items(), key=lambda x: -x[1])[:40]:
    print(f"unplaced: {t!r} x{c}", file=sys.stderr)
if sql_out:
    open(sql_out, "w", encoding="utf-8").write(sql)
    print("wrote", sql_out, len(sql), "bytes", file=sys.stderr)
else:
    p = subprocess.run(["psql", "-v", "ON_ERROR_STOP=1", "-q", "-1", "-f", "-"], input=sql, text=True, capture_output=True)
    if p.returncode:
        raise SystemExit(p.stderr[-800:])
    print("loaded", file=sys.stderr)
