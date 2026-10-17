#!/usr/bin/env python3
"""Fetch WNBA season, standings-template and club-season wikitext from English Wikipedia
(CC BY-SA 4.0) into a dated raw cache. Raw wikitext is saved exactly as served (action=raw),
never edited. One request per 2.5 s, identified User-Agent, backoff on 429/5xx. Existing files
are never refetched.

Library for season.py; run directly to fetch one season:  fetch.py YEAR   (1997 = the 1997 WNBA season)
The cache defaults to ~/Projects/backups/spx-stats/raw/wikipedia_wnba/<run date> (outside the repository); WNBA_CACHE overrides it.

Never used: Sports Reference sites, ESPN, the WNBA's own site or feeds (their terms bar automated collection). Recap
links some club logs transclude are not followed.
"""
import csv, os, re, ssl, sys, time, urllib.error, urllib.parse, urllib.request

UA = "spx-stats/0.1 (https://github.com/spxis/spx-stats)"
GAP = 2.5
RUN_DATE = os.environ.get("WNBA_RUN_DATE", "2026-10-16")
CACHE = os.environ.get("WNBA_CACHE", os.path.expanduser(f"~/Projects/backups/spx-stats/raw/wikipedia_wnba/{RUN_DATE}"))
SEED = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "db", "seed", "wnba_club.csv")
_last = [0.0]
CTX = ssl.create_default_context()

FIRST, LAST = 1997, 2026


def fname(title): return re.sub(r"[^A-Za-z0-9._-]+", "_", title) + ".wikitext"


def season_title(y): return f"{y} WNBA season"


def years(): return list(range(FIRST, LAST + 1))


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
    """Standings templates a season article transcludes: {{2024 WNBA standings}}, {{1997 WNBA Eastern Conference standings}}."""
    return sorted(set(m.strip() for m in re.findall(r"\{\{\s*(%d WNBA[^{}|]*?[Ss]tandings)\s*(?:\|[^{}]*)?\}\}" % y, text)))


def team_titles(y, text):
    """Club-season articles named in a season page or its standings templates: [[2024 Las Vegas Aces season|...]]."""
    out = set()
    for m in re.findall(r"\[\[(%d [^\]|#]+? season)" % y, text):
        if re.fullmatch(r"%d WNBA season" % y, m): continue
        if re.search(r"\bWNBA\b.*(draft|Playoffs|Finals|All-Star|Championship|season)$", m) and "Aces" not in m: continue
        out.add(m.strip())
    return out


def seed_team_titles(y):
    """Club-season titles from db/seed/wnba_club.csv for clubs that played this year.

    Early WNBA standings templates name clubs as [[Utah Starzz]], not [[2002 Utah Starzz season]],
    so team_titles() alone misses relocation and fold years (2002 Starzz, 2003 Connecticut Sun).
    """
    out = set()
    with open(SEED, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            if int(row["first_year"]) <= y <= int(row["last_year"]):
                out.add(f"{y} {row['club']} season")
    return out


def fetch_season(y):
    """Fetch the season article, its standings templates and every club-season article they (or the season article) name.
    Returns (files relative to CACHE, template titles, club-season titles)."""
    import parse as P
    files = []
    stext = page("season", season_title(y), files)
    if stext is None: return [], [], []
    if y == FIRST: page("league", "Women's National Basketball Association", files)
    tpl = template_titles(y, stext)
    ttext = ""
    from_standings = set()
    for t in tpl:
        x = page("template", "Template:" + t, files)
        if x:
            ttext += x
            for r in P.parse_standings(x, y):
                if r.get("team"):
                    from_standings.add(f"{y} {r['team']} season")
    nav = page("template", f"Template:{y} WNBA season by team", files)
    if nav:
        ttext += "\n" + nav
    teams = team_titles(y, ttext + "\n" + stext) | from_standings | seed_team_titles(y)
    for t in sorted(teams):
        page("team", t, files)
    return sorted(set(files)), tpl, sorted(teams)


if __name__ == "__main__":
    f, tpl, teams = fetch_season(int(sys.argv[1]))
    print(len(f), "files;", len(tpl), "templates;", len(teams), "teams")
