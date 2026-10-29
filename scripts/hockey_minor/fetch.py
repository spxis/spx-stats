#!/usr/bin/env python3
"""Fetch the season articles of North American minor-league hockey from English Wikipedia (CC BY-SA 4.0) into a dated raw cache.

Leagues (fetch.py LEAGUE [YEAR ...], default every season):
  ahl   the American Hockey League, 1936-37 (as the International-American Hockey League) to 2025-26 (90 seasons)
A season is named by the year it starts (1936 = 1936-37). Raw wikitext is saved exactly as served (action=raw), never edited; one request
per 2.5 s, identified User-Agent, backoff on 429/5xx (the HTTP and cache code is scripts/nfl/fetch.py's). Existing files are never refetched.
Besides the season article the fetcher saves the season's playoffs article where there is one, and the article the season article takes a section of ("{{#section:2019 Calder Cup
playoffs|2019bracket}}") and the standings templates, and once per league the league's own article and its list of seasons.
The cache defaults to ~/Projects/backups/spx-stats/raw/wikipedia_hockey_minor/<run date> (outside the repository); HOCKEY_MINOR_CACHE
overrides it, HOCKEY_MINOR_RUN_DATE names the day.
Never used: Sports Reference sites, ESPN, Elite Prospects, HockeyDB, the NHL's API or site, the PWHL feed.
"""
import importlib.util, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


F = _load("nfl_fetch", os.path.join(HERE, "..", "nfl", "fetch.py"))   # get, save, page, UA, GAP: the one HTTP and cache code

RUN_DATE = os.environ.get("HOCKEY_MINOR_RUN_DATE", "2026-10-28")
F.RUN_DATE = RUN_DATE
F.CACHE = os.environ.get("HOCKEY_MINOR_CACHE", os.path.expanduser(f"~/Projects/backups/spx-stats/raw/wikipedia_hockey_minor/{RUN_DATE}"))
CACHE = F.CACHE

# league -> (first season, last season, short name used in season titles, league article, other articles archived once, playoffs article title)
LEAGUES = {
    "ahl": (1936, 2025, "AHL", "American Hockey League", ["List of AHL seasons"], "{end} Calder Cup playoffs"),
}


def years(league): a, b = LEAGUES[league][:2]; return list(range(a, b + 1))


def span(y): return f"{y}–{str(y + 1)[2:]}"          # 1936 -> "1936–37"


def season_title(league, y): return f"{span(y)} {LEAGUES[league][2]} season"


def playoffs_title(league, y): return LEAGUES[league][5].format(end=y + 1, start=y)


def template_titles(text):
    """Standings templates a season article transcludes: {{2005–06 AHL West Division standings}}."""
    return sorted(set(m.strip() for m in re.findall(r"\{\{\s*(\d{4}[–-]\d{2} [^{}|]*?[Ss]tandings)\s*(?:\|[^{}]*)?\}\}", text)))


def section_pages(text):
    """Articles a season article reads a section of: {{#section:2019 Calder Cup playoffs|2019bracket}} (also #lst)."""
    return sorted(set(m.strip() for m in re.findall(r"\{\{\s*#(?:section|lst|section-h|lsth)\s*:\s*([^|{}]+?)\s*\|", text)))


def fetch_season(league, y):
    """Fetch the season article, its standings templates and the pages it transcludes a section of. Returns (files relative to CACHE, text or None)."""
    files = []
    text = F.page("season", season_title(league, y), files)
    if text is None: return [], None
    for t in template_titles(text):
        F.page("template", "Template:" + t, files)
    for p in sorted(set(section_pages(text)) | {playoffs_title(league, y)}):
        F.page("playoffs", p, files)
    return sorted(set(files)), text


def fetch_league(league):
    files = []
    F.page("league", LEAGUES[league][3], files)
    for t in LEAGUES[league][4]:
        F.page("league", t, files)
    return files


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0] not in LEAGUES: raise SystemExit("usage: fetch.py " + "|".join(LEAGUES) + " [YEAR ...]")
    lg = a[0]
    fetch_league(lg)
    for y in ([int(x) for x in a[1:]] or years(lg)):
        f, text = fetch_season(lg, y)
        print(lg, y, len(f), "files", flush=True)
