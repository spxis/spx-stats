#!/usr/bin/env python3
"""Fetch NFL season, standings-template and club-season wikitext from English Wikipedia (CC BY-SA 4.0)
into a dated raw cache. Raw wikitext is saved exactly as served (action=raw), never edited. One request
per 2.5 s, identified User-Agent, backoff on 429/5xx. Existing files are never refetched.

Library for season.py; run directly to fetch one season:  fetch.py YEAR   (1987 = the 1987 NFL season)
The cache defaults to ~/Projects/backups/spx-stats/raw/wikipedia_nfl/<run date> (outside the repository); NFL_CACHE overrides it.

Leagues (fetch.py [--league nfl|afl|aafc] YEAR): nfl is the NFL and, in 1920 and 1921, its first name, the APFA (the 1920 and 1921
"NFL season" titles are redirects to "1920 APFA season"); afl is the American Football League of 1960-1969; aafc is the All-America
Football Conference of 1946-1949.
"""
import os, re, ssl, sys, time, urllib.error, urllib.parse, urllib.request

UA = "spx-stats/0.1 (https://github.com/spxis/spx-stats)"
GAP = 2.5
RUN_DATE = os.environ.get("NFL_RUN_DATE", "2026-10-12")
CACHE = os.environ.get("NFL_CACHE", os.path.expanduser(f"~/Projects/backups/spx-stats/raw/wikipedia_nfl/{RUN_DATE}"))
_last = [0.0]
CTX = ssl.create_default_context()


def fname(title): return re.sub(r"[^A-Za-z0-9._-]+", "_", title) + ".wikitext"


LEAGUE_TITLE = {"nfl": "NFL", "afl": "AFL", "aafc": "AAFC"}


def season_title(y, league="nfl"): return f"{y} {LEAGUE_TITLE[league]} season"


# The article about a league that no longer plays: archived with the league's first season (infobox dates, the clubs that joined the NFL).
LEAGUE_PAGE = {"aafc": ("All-America Football Conference", 1946)}


def get(title):
    url = "https://en.wikipedia.org/w/index.php?title=" + urllib.parse.quote(title.replace(" ", "_")) + "&action=raw"
    delay = 20
    for _ in range(10):
        w = GAP - (time.time() - _last[0])
        if w > 0: time.sleep(w)
        _last[0] = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60, context=CTX) as r:
                return r.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            if e.code == 429 or e.code >= 500:
                ra = e.headers.get("Retry-After") if e.headers else None
                time.sleep(max(delay, int(ra) if ra and ra.isdigit() else 0)); delay = min(delay * 2, 600); continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(delay); delay = min(delay * 2, 600)
    raise RuntimeError("giving up on " + title)


def save(sub, title):
    """Return the page's wikitext (None for a missing page), fetching and caching it once."""
    os.makedirs(f"{CACHE}/{sub}", exist_ok=True)
    p = f"{CACHE}/{sub}/{fname(title)}"
    if os.path.exists(p):
        t = open(p, encoding="utf-8").read()
        return None if t.startswith("#MISSING 404") else t
    t = get(title)
    open(p, "w", encoding="utf-8").write(t if t is not None else "#MISSING 404\n")
    print(sub, title, "MISSING" if t is None else len(t), flush=True)
    return t


def page(sub, title, files=None):
    """Wikitext of a page, following #REDIRECT [[target]] (every page on the way is cached and listed in files)."""
    for _ in range(4):
        t = save(sub, title)
        if t is None: return None
        if files is not None: files.append(f"{sub}/{fname(title)}")
        m = re.match(r"\s*#REDIRECT\s*\[\[([^\]|#]+)", t, re.I)
        if not m: return t
        title = m.group(1).strip()
    return t


def template_titles(y, text):
    """Standings templates a season article transcludes: {{1987 AFC East standings}}."""
    return sorted(set(m.strip() for m in re.findall(r"\{\{\s*(%d (?:AFC|NFC|AFL|NFL|APFA|AAFC)[^{}|]*?[Ss]tandings)\s*(?:\|[^{}]*)?\}\}" % y, text)))


def team_titles(y, text):
    """Club-season articles named in a season's standings templates: [[1987 Chicago Bears season|...]]."""
    out = set()
    for m in re.findall(r"\[\[(%d [^\]|#]+? season)" % y, text):
        if re.fullmatch(r"%d (NFL|AFL|AFC|NFC|APFA|AAFC) season" % y, m): continue
        if re.search(r"(NFL|AFL|NFL draft|Pro Bowl|Super Bowl)\b.* season$", m) and "(NFL)" not in m and "(AFL)" not in m: continue
        out.add(m.strip())
    return out


# Clubs the standings templates name without a season article of their own: the two wartime mergers (1943 Eagles + Steelers,
# 1944 Cardinals + Steelers). Their season is told in the club's article, which is laid out like a club-season article.
EXTRA_CLUBS = {("nfl", 1943): {"Phil-Pitt Steagles": "Steagles"}, ("nfl", 1944): {"Card-Pitt": "Card-Pitt"}}


def extra_clubs(y, league="nfl"):
    """{club name: article title} for the clubs of that season that have no '<year> <club> season' article."""
    return dict(EXTRA_CLUBS.get((league, y), {}))


def fetch_season(y, league="nfl"):
    """Fetch the season article, its standings templates and every club-season article they name.
    Returns (files relative to CACHE, template titles, club-season titles)."""
    files = []
    stext = page("season", season_title(y, league), files)
    if stext is None: return [], [], []
    if league in LEAGUE_PAGE and y == LEAGUE_PAGE[league][1]: page("league", LEAGUE_PAGE[league][0], files)
    tpl = template_titles(y, stext)
    ttext = ""
    for t in tpl:
        x = page("template", "Template:" + t, files)
        if x: ttext += x
    teams = team_titles(y, ttext if ttext else stext)
    for t in sorted(teams):
        page("team", t, files)
    for t in extra_clubs(y, league).values():
        page("team", t, files)
    return sorted(set(files)), tpl, sorted(teams)


if __name__ == "__main__":
    a = sys.argv[1:]
    lg = "nfl"
    if a and a[0] == "--league": lg = a[1]; a = a[2:]
    f, tpl, teams = fetch_season(int(a[0]), lg)
    print(len(f), "files;", len(tpl), "templates;", len(teams), "teams")
