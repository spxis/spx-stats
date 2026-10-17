#!/usr/bin/env python3
"""Fetch NWSL season, standings-template and club-season wikitext from English Wikipedia
(CC BY-SA 4.0) into a dated raw cache. Raw wikitext is saved exactly as served (action=raw),
never edited. One request per 2.5 s, identified User-Agent, backoff on 429/5xx. Existing files
are never refetched.

Library for season.py; run directly to fetch one season:  fetch.py YEAR
(2013 = the 2013 NWSL season). The cache defaults to
~/Projects/backups/spx-stats/raw/wikipedia_nwsl/<run date> (outside the repository); NWSL_CACHE overrides it.

Never used: Sports Reference sites, ESPN, the NWSL's own site or feeds (their terms bar automated collection).
"""
import os, re, ssl, sys, time, urllib.error, urllib.parse, urllib.request

UA = "spx-stats/0.1 (https://github.com/spxis/spx-stats)"
GAP = 2.5
RUN_DATE = os.environ.get("NWSL_RUN_DATE", "2026-10-16")
CACHE = os.environ.get("NWSL_CACHE", os.path.expanduser(f"~/Projects/backups/spx-stats/raw/wikipedia_nwsl/{RUN_DATE}"))
_last = [0.0]
CTX = ssl.create_default_context()

FIRST, LAST = 2013, 2026


def fname(title): return re.sub(r"[^A-Za-z0-9._-]+", "_", title) + ".wikitext"


def season_title(y):
    """English Wikipedia titles the season with the full league name: '2013 National Women's Soccer League season'."""
    return f"{y} National Women's Soccer League season"


def season_title_short(y):
    return f"{y} NWSL season"


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
    """Standings templates a season article transcludes."""
    return sorted(set(m.strip() for m in re.findall(
        r"\{\{\s*(%d (?:National Women's Soccer League|NWSL)[^{}|]*?[Ss]tandings)\s*(?:\|[^{}]*)?\}\}" % y, text)))


def team_titles(y, text):
    """Club-season articles: [[2013 Portland Thorns FC season]], [[2025 Gotham FC season]]."""
    out = set()
    for m in re.findall(r"\[\[(%d [^\]|#]+? season)" % y, text):
        if re.search(r"National Women's Soccer League season$|NWSL season$", m): continue
        if re.search(r"(draft|Playoffs|Finals|All-Star|Championship|Challenge Cup|College|Allocation)$", m, re.I): continue
        out.add(m.strip())
    return out


def playoff_titles(y):
    return [f"{y} NWSL Playoffs", f"{y} NWSL Championship", f"{y} National Women's Soccer League Playoffs"]


def fetch_season(y):
    """Fetch the season article, its standings templates, playoff page and every club-season article they name.
    Returns (files relative to CACHE, template titles, club-season titles)."""
    files = []
    stext = page("season", season_title(y), files)
    if stext is None:
        stext = page("season", season_title_short(y), files)
    if stext is None: return [], [], []
    if y == FIRST: page("league", "National Women's Soccer League", files)
    tpl = template_titles(y, stext)
    ttext = ""
    for t in tpl:
        x = page("template", "Template:" + t, files)
        if x: ttext += x
    for t in playoff_titles(y):
        ptext = page("playoffs", t, files)
        if ptext: ttext += "\n" + ptext
    teams = team_titles(y, (ttext + "\n" + stext))
    for t in sorted(teams):
        page("team", t, files)
    return sorted(set(files)), tpl, sorted(teams)


if __name__ == "__main__":
    f, tpl, teams = fetch_season(int(sys.argv[1]))
    print(len(f), "files;", len(tpl), "templates;", len(teams), "teams")
