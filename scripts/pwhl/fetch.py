#!/usr/bin/env python3
"""Fetch PWHL season, standings-template and club-season wikitext from English Wikipedia
(CC BY-SA 4.0) into a dated raw cache. Raw wikitext is saved exactly as served (action=raw),
never edited. One request per 2.5 s, identified User-Agent, backoff on 429/5xx. Existing files
are never refetched.

Library for season.py; run directly to fetch one season:  fetch.py YEAR
(2023 = the 2023–24 PWHL season). The cache defaults to
~/Projects/backups/spx-stats/raw/wikipedia_pwhl/<run date> (outside the repository); PWHL_CACHE overrides it.

Never used: Sports Reference sites, ESPN, the PWHL's own site or feeds (their terms bar automated
collection), or any NHL endpoint.
"""
import os, re, ssl, sys, time, urllib.error, urllib.parse, urllib.request

UA = "spx-stats/0.1 (https://github.com/spxis/spx-stats)"
GAP = 2.5
RUN_DATE = os.environ.get("PWHL_RUN_DATE", "2026-10-16")
CACHE = os.environ.get("PWHL_CACHE", os.path.expanduser(f"~/Projects/backups/spx-stats/raw/wikipedia_pwhl/{RUN_DATE}"))
_last = [0.0]
CTX = ssl.create_default_context()

FIRST, LAST = 2023, 2025


def fname(title): return re.sub(r"[^A-Za-z0-9._-]+", "_", title) + ".wikitext"


def span(y):
    """2023 -> '2023–24' (en dash, as English Wikipedia titles the season)."""
    return f"{y}–{str(y + 1)[2:]}"


def season_title(y): return f"{span(y)} PWHL season"


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
    """Standings templates a season article transcludes: {{2023–24 PWHL standings}}."""
    sp = re.escape(span(y))
    hy = re.escape(f"{y}-{str(y + 1)[2:]}")
    return sorted(set(m.strip() for m in re.findall(
        r"\{\{\s*((?:%s|%s) PWHL[^{}|]*?[Ss]tandings)\s*(?:\|[^{}]*)?\}\}" % (sp, hy), text)))


def team_titles(y, text):
    """Club-season articles named in a season page or its standings templates: [[2023–24 PWHL Minnesota season|...]]."""
    sp = re.escape(span(y))
    hy = re.escape(f"{y}-{str(y + 1)[2:]}")
    out = set()
    for m in re.findall(r"\[\[((?:%s|%s) [^\]|#]+? season)" % (sp, hy), text):
        if re.fullmatch(r"(?:%s|%s) PWHL season" % (sp, hy), m): continue
        if re.search(r"(draft|Playoffs|Finals|All-Star|Championship|Takeover)$", m, re.I): continue
        out.add(m.strip())
    return out


def fetch_season(y):
    """Fetch the season article, its standings templates and every club-season article they (or the season article) name.
    Returns (files relative to CACHE, template titles, club-season titles)."""
    files = []
    stext = page("season", season_title(y), files)
    if stext is None: return [], [], []
    if y == FIRST: page("league", "Professional Women's Hockey League", files)
    tpl = template_titles(y, stext)
    ttext = ""
    for t in tpl:
        x = page("template", "Template:" + t, files)
        if x: ttext += x
    teams = team_titles(y, (ttext + "\n" + stext))
    for t in sorted(teams):
        page("team", t, files)
    return sorted(set(files)), tpl, sorted(teams)


if __name__ == "__main__":
    f, tpl, teams = fetch_season(int(sys.argv[1]))
    print(len(f), "files;", len(tpl), "templates;", len(teams), "teams")
