#!/usr/bin/env python3
"""Fetch NCAA Division I-A / FBS football season articles, their conference standings templates and every team-season article from
English Wikipedia (CC BY-SA 4.0) into a dated raw cache. Wikitext is saved exactly as served and never edited. Up to 10 titles per
MediaWiki API request, one request at a time, at least 2.5 s apart, an identified User-Agent, maxlag=5, backoff on 429 and 5xx.
Files already in the cache are never fetched again. Only English Wikipedia is read (no ESPN, no Sports Reference, no CFBD).

  fetch.py season YEAR [YEAR ...]       the season article and its standings templates
  fetch.py teams YEAR [YEAR ...]        the team-season articles named by the standings templates (needs `season` first)
  fetch.py all YEAR [YEAR ...]          both
  fetch.py --range FIRST LAST all       a run of years

The cache is NCAAF_CACHE, default ~/Projects/backups/spx-stats/raw/wikipedia_ncaaf/<run date> (NCAAF_RUN_DATE, default today); never in the repository.
Layout: <cache>/<year>/{season,template,team}/<title>.wikitext and <cache>/fetched.json (asked title -> resolved title, revision id, timestamp).
Opponents outside the division (FCS and lower) are not fetched: the FBS team's own article names them and gives the score.
"""
import datetime, json, os, re, ssl, sys, time, urllib.error, urllib.parse, urllib.request

UA = "spx-stats/0.1 (https://github.com/spxis/spx-stats; john@johnmorris.ca)"
GAP = 2.5
BATCH = 10
RUN_DATE = os.environ.get("NCAAF_RUN_DATE", datetime.date.today().isoformat())
CACHE = os.environ.get("NCAAF_CACHE", os.path.expanduser(f"~/Projects/backups/spx-stats/raw/wikipedia_ncaaf/{RUN_DATE}"))
API = "https://en.wikipedia.org/w/api.php"
CTX = ssl.create_default_context()
_last = [0.0]


def fname(title): return re.sub(r"[^A-Za-z0-9._-]+", "_", title) + ".wikitext"


def season_title(y): return f"{y} NCAA Division I-A football season" if y <= 2005 else f"{y} NCAA Division I FBS football season"


def _get(params):
    url = API + "?" + urllib.parse.urlencode(dict(params, format="json", formatversion="2", maxlag="5"))
    delay = 10
    for _ in range(8):
        w = GAP - (time.time() - _last[0])
        if w > 0: time.sleep(w)
        _last[0] = time.time()
        ra = None
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"}), timeout=90, context=CTX) as r:
                d = json.loads(r.read().decode("utf-8")); ra = r.headers.get("Retry-After")
        except urllib.error.HTTPError as e:
            ra = e.headers.get("Retry-After") if e.headers else None
            if e.code == 429 or e.code >= 500:
                time.sleep(max(delay, int(ra) if ra and ra.isdigit() else 0)); delay = min(delay * 2, 300); continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(delay); delay = min(delay * 2, 300); continue
        if "error" in d:
            if d["error"].get("code") == "maxlag":
                time.sleep(max(delay, int(ra) if ra and ra.isdigit() else 0)); delay = min(delay * 2, 300); continue
            raise RuntimeError("wikipedia api: " + json.dumps(d["error"])[:300])
        return d
    raise RuntimeError("giving up on the Wikipedia API")


def _log_path(): return os.path.join(CACHE, "fetched.json")


def load_log():
    try: return json.load(open(_log_path()))
    except (OSError, ValueError): return {}


def fetch_titles(year, sub, titles):
    """Cache each title's wikitext under <year>/<sub>/; a missing page is written as '#MISSING 404'. -> {title: text or None}."""
    d = os.path.join(CACHE, str(year), sub)
    os.makedirs(d, exist_ok=True)
    log = load_log()
    out, todo = {}, []
    for t in titles:
        p = os.path.join(d, fname(t))
        if os.path.exists(p):
            x = open(p, encoding="utf-8").read(); out[t] = None if x.startswith("#MISSING 404") else x
        else: todo.append(t)
    for i in range(0, len(todo), BATCH):
        batch = todo[i:i + BATCH]
        q = _get({"action": "query", "prop": "revisions", "rvprop": "ids|timestamp|content", "rvslots": "main", "titles": "|".join(batch), "redirects": "1"})["query"]
        hop = {}
        for x in q.get("normalized", []): hop[x["from"]] = x["to"]
        for x in q.get("redirects", []): hop[x["from"]] = x["to"]
        pages = {p["title"]: p for p in q.get("pages", [])}
        for t in batch:
            f = t
            for _ in range(5):
                if f in hop: f = hop[f]
            pg = pages.get(f)
            if pg is None or pg.get("missing") or not pg.get("revisions"):
                open(os.path.join(d, fname(t)), "w", encoding="utf-8").write("#MISSING 404\n"); out[t] = None
                print(sub, year, t, "MISSING", flush=True); continue
            rv = pg["revisions"][0]; text = rv["slots"]["main"]["content"]
            open(os.path.join(d, fname(t)), "w", encoding="utf-8").write(text); out[t] = text
            log[f"{year}/{sub}/{fname(t)}"] = {"asked": t, "title": f, "revid": rv["revid"], "timestamp": rv["timestamp"], "fetched_on": RUN_DATE}
        json.dump(log, open(_log_path(), "w"), indent=1, sort_keys=True, ensure_ascii=False)
        print(sub, year, f"{min(i + BATCH, len(todo))}/{len(todo)}", flush=True)
    return out


def template_titles(y, text):
    """Standings templates a season article transcludes: {{2005 Big 12 Conference football standings}}, {{2005 ... independents football records}}."""
    found = re.findall(r"\{\{\s*(%d [^{}|]*?football (?:standings|records))\s*(?:\|[^{}]*)?\}\}" % y, text)
    return sorted(set(re.sub(r"\s+", " ", t).strip() for t in found))


def team_titles(y, ttext):
    """Team-season articles named in the standings templates' entries: [[2005 Texas Longhorns football team|Texas]]."""
    out = set()
    for m in re.finditer(r"CFB standings entry\s*\|(.*)", ttext, re.I):
        for t in re.findall(r"\[\[(%d [^\]|#]+? football team)" % y, m.group(1)):
            out.add(t.strip())
    return sorted(out)


def fetch_season(y):
    s = fetch_titles(y, "season", [season_title(y)])[season_title(y)]
    if s is None: print(y, "no season article"); return None, []
    tpl = template_titles(y, s)
    tx = fetch_titles(y, "template", ["Template:" + t for t in tpl])
    return s, tpl


def fetch_teams(y):
    st = os.path.join(CACHE, str(y), "season", fname(season_title(y)))
    if not os.path.exists(st): raise SystemExit(f"{y}: fetch the season first")
    tpl = template_titles(y, open(st, encoding="utf-8").read())
    ttext = ""
    for t in tpl:
        p = os.path.join(CACHE, str(y), "template", fname("Template:" + t))
        if os.path.exists(p): ttext += open(p, encoding="utf-8").read() + "\n"
    teams = team_titles(y, ttext)
    fetch_titles(y, "team", teams)
    return teams


if __name__ == "__main__":
    a = sys.argv[1:]
    years = None
    if a and a[0] == "--range": years = list(range(int(a[1]), int(a[2]) + 1)); a = a[3:]
    mode = a[0]; years = years or [int(x) for x in a[1:]]
    os.makedirs(CACHE, exist_ok=True)
    for y in years:
        if mode in ("season", "all"): fetch_season(y)
        if mode in ("teams", "all"): print(y, len(fetch_teams(y)), "team articles")
