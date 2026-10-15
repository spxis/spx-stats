#!/usr/bin/env python3
"""Fetch the season articles of the rival and predecessor hockey leagues from English Wikipedia (CC BY-SA 4.0) into a dated raw cache.

Leagues (fetch.py LEAGUE [YEAR ...], default every season):
  nha   the National Hockey Association, 1909-10 to 1916-17 (8 seasons)
  pcha  the Pacific Coast Hockey Association, 1911-12 to 1923-24 (13)
  wchl  the Western Canada Hockey League, 1921-22 to 1924-25, and as the Western Hockey League 1925-26 (5)
  wha   the World Hockey Association, 1972-73 to 1978-79 (7)
A season is named by the year it starts (1909 = the 1909-10 NHA season). Raw wikitext is saved exactly as served (action=raw), never
edited; one request per 2.5 s, identified User-Agent, backoff on 429/5xx (the HTTP and cache code is scripts/nfl/fetch.py's). Existing
files are never refetched. Besides the season article the fetcher saves the standings templates it transcludes ("{{1915-16 NHA standings}}")
and, once per league, the league's own article. The cache defaults to ~/Projects/backups/spx-stats/raw/wikipedia_hockey/<run date>
(outside the repository); HOCKEY_CACHE overrides it, HOCKEY_RUN_DATE names the day.
Never used: Sports Reference sites, ESPN, the NHL's API or site.
"""
import importlib.util, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


F = _load("nfl_fetch", os.path.join(HERE, "..", "nfl", "fetch.py"))   # get, save, page, UA, GAP: the one HTTP and cache code

RUN_DATE = os.environ.get("HOCKEY_RUN_DATE", "2026-10-15")
F.RUN_DATE = RUN_DATE
F.CACHE = os.environ.get("HOCKEY_CACHE", os.path.expanduser(f"~/Projects/backups/spx-stats/raw/wikipedia_hockey/{RUN_DATE}"))
CACHE = F.CACHE

# league -> (first season, last season, article name of the league)
LEAGUES = {
    "nha": (1909, 1916, "National Hockey Association"),
    "pcha": (1911, 1923, "Pacific Coast Hockey Association"),
    "wchl": (1921, 1925, "Western Canada Hockey League"),
    "wha": (1972, 1978, "World Hockey Association"),
}


def years(league): a, b, _ = LEAGUES[league]; return list(range(a, b + 1))


def span(y): return f"{y}–{str(y + 1)[2:]}"          # 1909 -> "1909–10"


def season_title(league, y):
    """The article's title: '1909–10 NHA season' (a redirect to '1910 NHA season'); the WCHL was renamed WHL for 1925-26."""
    name = "WHL" if (league == "wchl" and y == 1925) else league.upper()
    return f"{span(y)} {name} season"


def template_titles(y, text):
    """Standings templates a season article transcludes: {{1972–73 WHA Eastern Division standings}}, {{1915–16 NHA standings|team=}}."""
    return sorted(set(m.strip() for m in re.findall(r"\{\{\s*(\d{4}[–-]\d{2} [^{}|]*?[Ss]tandings)\s*(?:\|[^{}]*)?\}\}", text)))


def fetch_season(league, y):
    """Fetch the season article and its standings templates. Returns (files relative to CACHE, article text or None, template titles)."""
    files = []
    text = F.page("season", season_title(league, y), files)
    if text is None: return [], None, []
    tpl = template_titles(y, text)
    for t in tpl:
        F.page("template", "Template:" + t, files)
    return sorted(set(files)), text, tpl


def fetch_league(league):
    files = []
    F.page("league", LEAGUES[league][2], files)
    return files


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0] not in LEAGUES: raise SystemExit("usage: fetch.py " + "|".join(LEAGUES) + " [YEAR ...]")
    lg = a[0]
    for y in ([int(x) for x in a[1:]] or years(lg)):
        f, text, tpl = fetch_season(lg, y)
        print(lg, y, len(f), "files;", len(tpl), "templates")
    fetch_league(lg)
