#!/usr/bin/env python3
"""Raw answers (wd_fetch.py, wp_fetch.py) -> one SQL file that loads legacy_rosters (migration 092) and archives the raw files.

  load.py <nba|cfl> <raw dir> <out.sql>

The SQL is inline (no server-side file reads), so the coordinator applies it to DS1 with scripts/mac/ds1-apply.sh <out.sql>.
It replaces this league's club, player and Wikipedia roster rows and the rows of every Wikidata item it carries; other leagues' rows are left alone.
Each raw file is kept as gzip in legacy_files.raw_archive, named wikidata_rosters/<day>/<league>/<file>.gz (the bytes of the answer, compressed;
`gunzip` returns the file exactly). Wikipedia files are named the same way, so a row is traced back to the article title and revision id in
articles-NNN.json."""
import gzip, hashlib, importlib.util, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, path))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
pl = load("people_load", "../people/load.py")
wp = load("wp_parse", "wp_parse.py")
CLAIM_COLS = pl.CLAIM_COLS
ENTITY_FILES = re.compile(r"^(persons|personswp|items|countries)-\d+\.json$")

def to_int(v):
    m = re.match(r"\s*(\d+)", v or "")
    return int(m.group(1)) if m else None

def main(league, raw, out):
    doc = json.load(open(f"{raw}/players.json", encoding="utf-8"))
    day = doc["queried_on"]
    files = sorted(f for f in os.listdir(raw) if f.endswith(".json"))
    items, redirects, claims = {}, {}, []
    for f in files:
        if not ENTITY_FILES.match(f): continue
        d = json.load(open(f"{raw}/{f}", encoding="utf-8"))
        redirects.update(d.get("redirects") or {})
        for k, e in d["entities"].items():
            if e.get("missing") or not e.get("id"): continue
            qid = e["id"]
            if qid in items: continue
            items[qid] = (qid, (e.get("labels") or {}).get("en", {}).get("value"), (e.get("sitelinks") or {}).get("enwiki", {}).get("title"), day)
            for prop, lst in (e.get("claims") or {}).items():
                for n, c in enumerate(lst):
                    r = pl.claim_row(qid, prop, n, c)
                    if r: claims.append(r)
    teams = {}
    for r in doc["rows"]: teams[r["team"]] = r["team_label"]
    players = sorted({redirects.get(r["player"], r["player"]) for r in doc["rows"]}, key=lambda x: int(x[1:]))

    # Wikipedia rosters
    arts, rows, titles = [], [], {}
    for f in files:
        d = json.load(open(f"{raw}/{f}", encoding="utf-8"))
        if f.startswith("articles-"):
            for a in d["articles"]:
                sects = a.get("sections") or {}
                arts.append((league, a["season"], a["club"], a["title"], a.get("revid"), a.get("timestamp"), bool(a.get("missing")), "roster" in sects, "stats" in sects))
                for e in wp.entries(league, sects):
                    rows.append((league, a["season"], a["club"], e["src"], e["ord"], e["name"], e["title"], e["num"], e["pos"], e["dob"],
                                 to_int(e["ft"]) * 12 + (to_int(e["inch"]) or 0) if to_int(e["ft"]) else None, to_int(e["lbs"]), e["college"], e["note"]))
        elif f.startswith("titles-"):
            norm = {n["from"]: n["to"] for n in d.get("normalized", [])}
            redir = {n["from"]: n["to"] for n in d.get("redirects", [])}
            pages = {p["title"]: p for p in d["pages"]}
            for t in d["requested"]:
                r = norm.get(t, t); r = redir.get(r, r)
                p = pages.get(r)
                titles[t] = (t, r, p.get("qid") if p else None, bool(p and p.get("disambiguation")), bool(not p or p.get("missing")))

    sql = ["begin;"]
    def copy(table, cols, data):
        sql.append(f"copy {table} ({', '.join(cols)}) from stdin;")
        sql.extend("\t".join(pl.tsv(x) for x in r) for r in data); sql.append("\\.")
    sql.append("create temp table n_item (like legacy_rosters.item) on commit drop;")
    sql.append("create temp table n_claim (like legacy_rosters.claim) on commit drop;")
    copy("n_item", ["qid", "label", "enwiki_title", "fetched_on"], items.values())
    copy("n_claim", CLAIM_COLS, ([r.get(c) for c in CLAIM_COLS] for r in claims))
    sql.append("delete from legacy_rosters.claim where qid in (select qid from n_item);")
    sql.append("insert into legacy_rosters.claim select * from n_claim;")
    sql.append("insert into legacy_rosters.item select * from n_item on conflict (qid) do update set label = excluded.label, enwiki_title = excluded.enwiki_title, fetched_on = excluded.fetched_on;")
    sql.append("create temp table n_redirect (from_qid text, to_qid text) on commit drop;")
    copy("n_redirect", ["from_qid", "to_qid"], redirects.items())
    sql.append("insert into legacy_rosters.redirect select * from n_redirect on conflict (from_qid) do update set to_qid = excluded.to_qid;")
    sql.append(f"delete from legacy_rosters.league_team where league_code = {pl.q(league)};")
    copy("legacy_rosters.league_team", ["league_code", "team_qid", "label"], ((league, t, l) for t, l in sorted(teams.items())))
    sql.append(f"delete from legacy_rosters.league_player where league_code = {pl.q(league)};")
    copy("legacy_rosters.league_player", ["league_code", "qid", "queried_on"], ((league, p, day) for p in players))
    sql.append(f"delete from legacy_rosters.wp_roster where league_code = {pl.q(league)};")
    sql.append(f"delete from legacy_rosters.wp_article where league_code = {pl.q(league)};")
    copy("legacy_rosters.wp_article", ["league_code", "season", "club", "page_title", "revid", "revised_at", "missing", "has_roster", "has_stats"],
         ((*a[:6], "t" if a[6] else "f", "t" if a[7] else "f", "t" if a[8] else "f") for a in arts))
    copy("legacy_rosters.wp_roster", ["league_code", "season", "club", "src", "ord", "name", "link_title", "number", "pos", "dob", "height_in", "weight_lb", "college", "note"], rows)
    if titles:
        sql.append("create temp table n_title (like legacy_rosters.wp_title) on commit drop;")
        copy("n_title", ["title", "resolved_title", "qid", "disambiguation", "missing"], ((t[0], t[1], t[2], "t" if t[3] else "f", "t" if t[4] else "f") for t in titles.values()))
        sql.append("insert into legacy_rosters.wp_title select * from n_title on conflict (title) do update set resolved_title = excluded.resolved_title, qid = excluded.qid, "
                   "disambiguation = excluded.disambiguation, missing = excluded.missing;")
    for f in files:
        b = gzip.compress(open(f"{raw}/{f}", "rb").read(), mtime=0)
        sql.append("insert into legacy_files.raw_archive (name, saved_on, sha256, data) values "
                   f"({pl.q(f'wikidata_rosters/{day}/{league}/{f}.gz')}, {pl.q(day)}, '{hashlib.sha256(b).hexdigest()}', decode('{b.hex()}', 'hex')) "
                   "on conflict (name) do update set saved_on = excluded.saved_on, sha256 = excluded.sha256, data = excluded.data;")
    sql.append(f"select '{league}' as league, (select count(*) from legacy_rosters.league_player where league_code = '{league}') as wd_players, "
               f"(select count(*) from legacy_rosters.league_team where league_code = '{league}') as clubs, (select count(*) from legacy_rosters.claim where prop = 'P54') as team_statements, "
               f"(select count(*) from legacy_rosters.wp_article where league_code = '{league}') as articles, (select count(*) from legacy_rosters.wp_roster where league_code = '{league}') as roster_rows;")
    sql.append("commit;")
    open(out, "w", encoding="utf-8").write("\n".join(sql) + "\n")
    print(len(items), "items,", len(claims), "statements,", len(players), "players,", len(teams), "clubs,", len(arts), "articles,", len(rows), "roster rows,",
          len(titles), "titles,", len(files), "files archived ->", out)

if __name__ == "__main__":
    if len(sys.argv) != 4 or sys.argv[1] not in ("nba", "cfl"): sys.exit(__doc__)
    main(*sys.argv[1:])
