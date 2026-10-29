#!/usr/bin/env python3
"""Fetch the season articles of North American minor-league hockey from English Wikipedia (CC BY-SA 4.0) into a dated raw cache.

Leagues (fetch.py LEAGUE [YEAR ...], default every season):
  ahl   the American Hockey League, 1936-37 (as the International-American Hockey League) to 2025-26 (90 seasons)
  echl  the ECHL, 1988-89 (as the East Coast Hockey League until 2002-03) to 2025-26 (38 seasons)
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

RUN_DATE = os.environ.get("HOCKEY_MINOR_RUN_DATE", "2026-10-29")
F.RUN_DATE = RUN_DATE
F.CACHE = os.environ.get("HOCKEY_MINOR_CACHE", os.path.expanduser(f"~/Projects/backups/spx-stats/raw/wikipedia_hockey_minor/{RUN_DATE}"))
CACHE = F.CACHE

# league -> (first season, last season, short name used in season titles, league article, other articles archived once, playoffs article title)
LEAGUES = {
    "ahl": (1936, 2025, "AHL", "American Hockey League", ["List of AHL seasons"], "{end} Calder Cup playoffs"),
    "echl": (1988, 2025, "ECHL", "ECHL", ["List of ECHL seasons"], "{end} Kelly Cup playoffs"),
}


def years(league): a, b = LEAGUES[league][:2]; return list(range(a, b + 1))


def span(y): return f"{y}–{str(y + 1)[2:]}"          # 1936 -> "1936–37"


def season_title(league, y): return f"{span(y)} {LEAGUES[league][2]} season"


def playoffs_title(league, y): return LEAGUES[league][5].format(end=y + 1, start=y)


def template_titles(text):
    """Standings templates a season article transcludes: {{2005–06 AHL West Division standings}}."""
    return sorted(set(m.strip() for m in re.findall(r"\{\{\s*(\d{4}[–-]\d{2} [^{}|]*?[Ss]tandings)\s*(?:\|[^{}]*)?\}\}", text)))


def bracket_templates(text):
    """Bracket templates a season or playoffs article transcludes by name: {{2013 Kelly Cup Playoffs}} (the bracket is the template's page)."""
    return sorted(set(m.strip() for m in re.findall(r"\{\{\s*(\d{4} (?:Kelly|Riley) Cup [Pp]layoffs)\s*\}\}", text)))


def fetch_template(title, files):
    """A bracket template's wikitext, following one redirect ("2013 Kelly Cup Playoffs" -> "2013 Kelly Cup playoffs"). The target goes to its own folder: a title that differs
    from its redirect only in case would be the same file on a Mac."""
    t = F.save("template", "Template:" + title)
    if t is None: return None
    files.append("template/" + F.fname("Template:" + title))
    m = re.match(r"\s*#REDIRECT\s*\[\[([^\]|#]+)", t, re.I)
    if not m: return t
    target = m.group(1).strip()
    t2 = F.save("template-target", target)
    if t2 is not None: files.append("template-target/" + F.fname(target))
    return t2


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
    seen = []
    for p in sorted(set(section_pages(text)) | {playoffs_title(league, y)}):
        pt = F.page("playoffs", p, files)
        seen.append(text if pt is None else pt)
    for t in sorted(set(bracket_templates(text)) | set(x for pt in seen for x in bracket_templates(pt))):
        fetch_template(t, files)
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
