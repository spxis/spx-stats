#!/usr/bin/env python3
"""Fetch NBA/BAA season, standings-template and team-season wikitext from English Wikipedia
(CC BY-SA 4.0) into a dated raw cache. Raw wikitext is saved exactly as served (action=raw),
never edited. One request per 2.5 s, identified User-Agent, backoff on 429/5xx. Existing files
are never refetched.

Library for season.py; run directly to fetch one season:  fetch.py YEAR   (2012 = 2012-13)
"""
import os, re, ssl, sys, time, urllib.error, urllib.parse, urllib.request

UA = "spx-stats/0.1 (https://github.com/spxis/spx-stats)"
GAP = 2.5
CACHE = os.environ.get("NBA_CACHE", "/home/user/spxwork/nba/raw/wikipedia/2026-10-10")
_last = [0.0]
ca = os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt"
CTX = ssl.create_default_context(cafile=ca) if os.path.exists(ca) else ssl.create_default_context()
DASH = "–"

def fname(title): return re.sub(r"[^A-Za-z0-9._-]+", "_", title) + ".wikitext"

def season_label(y): return f"{y}{DASH}2000" if y == 1999 else f"{y}{DASH}{str(y + 1)[-2:]}"

def season_title(y): return f"{season_label(y)} {'BAA' if y < 1949 else 'NBA'} season"

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

def template_titles(text):
    return sorted(set(m.strip() for m in re.findall(r"\{\{\s*(\d{4}–\d{2,4} (?:NBA|BAA)[^{}|]*?[Ss]tandings)\s*(?:\|[^{}]*)?\}\}", text)))

def team_titles(y, text):
    lab = season_label(y)
    out = set()
    for m in re.findall(r"\[\[(" + re.escape(lab) + r" [^\]|#]+? season)", text):
        if re.search(r"\b(NBA|BAA|ABA|NBL|NBA Finals)\b season$", m) and not re.search(r"Nets|Spurs", m): continue
        out.add(m.strip())
    return out

def fetch_season(y):
    """Fetch the season article, its standings templates and every team-season article it names.
    Returns the list of files (relative to CACHE) that belong to the season."""
    files = []
    st = season_title(y)
    stext = page("season", st, files)
    if stext is None: return [], [], []
    tpl = template_titles(stext)
    ttext = ""
    for t in tpl:
        x = page("template", "Template:" + t, files)
        if x: ttext += x
    teams = team_titles(y, ttext if ttext else stext)
    for t in sorted(teams):
        page("team", t, files)
    return sorted(set(files)), tpl, sorted(teams)

if __name__ == "__main__":
    f, tpl, teams = fetch_season(int(sys.argv[1]))
    print(len(f), "files;", len(tpl), "templates;", len(teams), "teams")
