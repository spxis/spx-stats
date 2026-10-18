#!/usr/bin/env python3
"""Fetch the club-season articles of the NHA, PCHA, WCHL/WHL and WHA ("1974–75 Houston Aeros season") from English Wikipedia (CC BY-SA 4.0), raw first.

  club_fetch.py [LEAGUE ...] [--list]        LEAGUE: nha | pcha | wchl | wha (default all four); --list prints the titles and fetches nothing

The club seasons are the clubs of each season article's standings (the season articles are read from the cache scripts/hockey/fetch.py keeps; none is
fetched here that is not there already). One MediaWiki API call asks for 10 articles with their wikitext, revision id and timestamp; one file is saved
per article under <cache>/club_season/ as served: {league, season, club, requested, title, revid, timestamp, missing, content}. A file that exists is never
fetched again, so a stopped run resumes and a rerun costs nothing. The cache is ~/Projects/backups/spx-stats/raw/wikipedia_hockey_old/<run date>
(outside the repository; HOCKEY_OLD_CACHE overrides, HOCKEY_OLD_DATE names the day). One request every 2.1 s, maxlag=5, the project's User-Agent, 429 and 5xx back off.
What exists on English Wikipedia (probed 2026-10-18, 192 candidate titles): WHA 76 of 82 club seasons by the plain title and the 3 clubs that moved mid-season
under a combined title ("1974–75 Michigan Stags/Baltimore Blades season"), NHA 22 of 45 (the Canadiens, Senators, Toronto, Ottawa), PCHA 2 of 41 (the 1914-15
Millionaires, the 1916-17 Metropolitans), WCHL 0 of 24.
Never used: Sports Reference, ESPN, the NHL's API or site.
"""
import importlib.util, json, os, re, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch as F, parse as P   # noqa: E402


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


WF = _load("wp_fetch", os.path.join(HERE, "..", "rosters", "wp_fetch.py"))   # api(): the one MediaWiki API caller (gap, maxlag, backoff, User-Agent)

RUN_DATE = os.environ.get("HOCKEY_OLD_DATE", "2026-10-18")
CACHE = os.environ.get("HOCKEY_OLD_CACHE", os.path.expanduser(f"~/Projects/backups/spx-stats/raw/wikipedia_hockey_old/{RUN_DATE}"))
DIR = os.path.join(CACHE, "club_season")

# a standings row for a club that moved during the season is one row "A / B"; Wikipedia has one article for it under a combined title
COMBINED = {
    "NY Golden Blades / Jersey Knights": "New York Golden Blades/New Jersey Knights",
    "Michigan Stags / Baltimore Blades": "Michigan Stags/Baltimore Blades",
    "Denver Spurs / Ottawa Civics": "Denver Spurs/Ottawa Civics",
}
SKIP = {"Les Canadiens": "1909–10 Montreal Canadiens season"}   # the standings' "Les Canadiens" is the article of the Montreal Canadiens (a redirect)


def slug(s): return re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_")


def season_label(y): return F.span(y)


def club_seasons(leagues):
    """[(league, season, club name as the standings give it, article title)] from the cached season articles."""
    out = []
    for lg in leagues:
        league_text = F.F.page("league", F.LEAGUES[lg][2]) or ""
        for y in F.years(lg):
            files, text, tpl = F.fetch_season(lg, y)
            if text is None: continue
            templates = [(t, F.F.page("template", "Template:" + t)) for t in tpl]
            r = P.parse_season(text, templates, y, lg, league_text)
            for club in r["teams"]:
                title = SKIP.get(club) or f"{season_label(y)} {COMBINED.get(club, club)} season"
                out.append((lg, y, club, title))
    return out


def path_of(lg, y, club): return os.path.join(DIR, f"{lg}_{y}_{slug(club)}.json")


def fetch(rows):
    os.makedirs(DIR, exist_ok=True)
    todo = [r for r in rows if not os.path.exists(path_of(r[0], r[1], r[2]))]
    print(len(rows), "club seasons,", len(todo), "to fetch", flush=True)
    for i in range(0, len(todo), 10):
        batch = todo[i:i + 10]
        d = WF.api(action="query", prop="revisions", rvprop="ids|timestamp|content", rvslots="main", redirects="1", titles="|".join(t for *_, t in batch))
        q = d.get("query", {})
        norm = {n["from"]: n["to"] for n in q.get("normalized", [])}
        redir = {n["from"]: n["to"] for n in q.get("redirects", [])}
        pages = {pg["title"]: pg for pg in q.get("pages", [])}
        for lg, y, club, title in batch:
            t = norm.get(title, title); t = redir.get(t, t)
            pg = pages.get(t)
            rec = {"league": lg, "season": y, "club": club, "requested": title, "title": t}
            if not pg or pg.get("missing") or not pg.get("revisions"):
                rec["missing"] = True
            else:
                rev = pg["revisions"][0]
                rec.update(revid=rev["revid"], timestamp=rev["timestamp"], content=rev["slots"]["main"]["content"])
            with open(path_of(lg, y, club), "w", encoding="utf-8") as f: json.dump(rec, f, ensure_ascii=False)
        print(i + len(batch), "of", len(todo), flush=True)


def season_rows(lg, y, names):
    """[(league, season, club, title)] for one season's clubs (names: the club names of its standings)."""
    return [(lg, y, c, SKIP.get(c) or f"{season_label(y)} {COMBINED.get(c, c)} season") for c in names]


def ensure(lg, y, names):
    """Fetch the club articles of one season that are not saved yet; -> the saved dicts of that season."""
    fetch(season_rows(lg, y, names))
    return [a for a in articles([lg]) if a["season"] == y]


def articles(leagues=None):
    """Every saved article, sorted: the dicts club_fetch.py wrote."""
    out = []
    if not os.path.isdir(DIR): return out
    for f in sorted(os.listdir(DIR)):
        if not f.endswith(".json"): continue
        d = json.load(open(os.path.join(DIR, f), encoding="utf-8"))
        if leagues is None or d["league"] in leagues: out.append(d)
    return out


if __name__ == "__main__":
    a = [x for x in sys.argv[1:] if not x.startswith("--")]
    lgs = a or list(F.LEAGUES)
    if any(x not in F.LEAGUES for x in lgs): raise SystemExit(__doc__)
    rows = club_seasons(lgs)
    if "--list" in sys.argv:
        for r in rows: print("\t".join(map(str, r)))
        raise SystemExit
    fetch(rows)
    got = articles(lgs)
    for lg in lgs:
        g = [x for x in got if x["league"] == lg]
        print(lg, len(g), "files,", sum(1 for x in g if x.get("missing")), "missing")
