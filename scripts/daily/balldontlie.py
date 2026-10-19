#!/usr/bin/env python3
"""balldontlie, free tier: the NBA schedule and scores. A second source next to the clubs' Wikipedia articles, and the only one for
a season whose schedule the articles do not carry yet (the 2026-27 season: the articles hold no regular-season rows in October).

Documentation: https://docs.balldontlie.io  (NBA, "Get all games": GET https://api.balldontlie.io/v1/games, filters seasons[],
start_date, end_date, postseason, per_page up to 100, a `cursor` for the next page; "Get all teams": GET /v1/teams).
Only the free tier's endpoints are used (teams and games). Never call a paid endpoint and never start a trial.
The free tier allows 5 requests a minute (the response says so in x-ratelimit-*), so every request is spaced 13 s apart by the shared limiter (limiter.py; the spacing is in sources.py and equals PAGE_GAP).

The key: on a Mac, the keychain item 'spx-stats balldontlie api key', read inside this process; elsewhere (the Docker job on the NAS)
the environment variable BALLDONTLIE_API_KEY, kept in daily.env. It is never printed or logged. With no key the source is skipped.

What is kept: the season's games as balldontlie returned them (each game object verbatim), merged by game id into one file in the raw
cache, `balldontlie/games-<season>.json`. The first run of a season, and one a week, reads the whole season (about 13 requests for
1,230 games); the other days only the games from `since` to tomorrow (a result can only be there), which is enough to follow results. That file, without its fetch
time, is what is archived (apply.py), so the archive row only changes when a game does.
"""
import datetime, hashlib, json, os, subprocess, sys, time, urllib.error, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import limiter as LM, parsers as P, sources as SRC, teams as T

API = "https://api.balldontlie.io/v1"
KEYCHAIN_ITEM = "spx-stats balldontlie api key"
PAGE_GAP = 13                       # seconds between requests: the free tier is 5 a minute
FULL_EVERY_DAYS = 7
SOURCE = "balldontlie"
TITLE = "games.json"

# balldontlie's NBA team ids (GET /v1/teams, checked 2026-10-12) -> abbreviation and the club's full name in DS1.
# Fixed on purpose: a team the table does not know is reported as unreadable, never guessed. balldontlie also lists defunct
# clubs (ids 37 to 51) and foreign clubs that play NBA preseason games; none of them is an NBA club of a season we hold.
TEAMS = {
    1: ("ATL", "Atlanta Hawks"), 2: ("BOS", "Boston Celtics"), 3: ("BKN", "Brooklyn Nets"), 4: ("CHA", "Charlotte Hornets"),
    5: ("CHI", "Chicago Bulls"), 6: ("CLE", "Cleveland Cavaliers"), 7: ("DAL", "Dallas Mavericks"), 8: ("DEN", "Denver Nuggets"),
    9: ("DET", "Detroit Pistons"), 10: ("GSW", "Golden State Warriors"), 11: ("HOU", "Houston Rockets"), 12: ("IND", "Indiana Pacers"),
    13: ("LAC", "Los Angeles Clippers"), 14: ("LAL", "Los Angeles Lakers"), 15: ("MEM", "Memphis Grizzlies"), 16: ("MIA", "Miami Heat"),
    17: ("MIL", "Milwaukee Bucks"), 18: ("MIN", "Minnesota Timberwolves"), 19: ("NOP", "New Orleans Pelicans"), 20: ("NYK", "New York Knicks"),
    21: ("OKC", "Oklahoma City Thunder"), 22: ("ORL", "Orlando Magic"), 23: ("PHI", "Philadelphia 76ers"), 24: ("PHX", "Phoenix Suns"),
    25: ("POR", "Portland Trail Blazers"), 26: ("SAC", "Sacramento Kings"), 27: ("SAS", "San Antonio Spurs"), 28: ("TOR", "Toronto Raptors"),
    29: ("UTA", "Utah Jazz"), 30: ("WAS", "Washington Wizards"),
}


def api_key():
    """The key, or None. Never printed."""
    if sys.platform == "darwin":
        p = subprocess.run(["security", "find-generic-password", "-s", KEYCHAIN_ITEM, "-w"], capture_output=True, text=True)
        key = p.stdout.strip() if p.returncode == 0 else ""
        return key or None
    return os.environ.get("BALLDONTLIE_API_KEY", "").strip() or None


def cache_path(raw_dir, season):
    return os.path.join(raw_dir, SOURCE, "games-%d.json" % season)


def load_cache(raw_dir, season):
    path = cache_path(raw_dir, season)
    if not os.path.exists(path): return {"season": season, "games": {}}
    with open(path, encoding="utf-8") as f: d = json.load(f)
    return {"season": d.get("season", season), "games": {str(g["id"]): g for g in d.get("games", [])}}


def canonical(cache):
    """The bytes that are archived: the games as returned, ordered by id, with nothing that changes between identical fetches."""
    body = {"source": API + "/games", "season": cache["season"], "games": [cache["games"][k] for k in sorted(cache["games"], key=int)]}
    return (json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode("utf-8")


def save_cache(raw_dir, cache):
    path = cache_path(raw_dir, cache["season"])
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f: f.write(canonical(cache))


def subset(raw_dir, season):
    """The season's cached games -> (bytes, sha256), or None when nothing is cached."""
    cache = load_cache(raw_dir, season)
    if not cache["games"]: return None
    data = canonical(cache)
    return data, hashlib.sha256(data).hexdigest()


class Throttled(Exception):
    """HTTP 429: the account's 5 a minute are used up. The limiter then holds every caller off for `wait` seconds."""

    def __init__(self, wait): self.wait = wait


def _request(url, key):
    """ONE request to balldontlie (the caller holds the source's slot). -> the parsed JSON."""
    SRC.guard_url(url)
    req = urllib.request.Request(url, headers={"Authorization": key, "User-Agent": os.environ.get("SPX_WIKI_UA", "spx-stats/1.0 (https://spxn.com; john@spxis.com)")})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 429: raise Throttled(max(int(e.headers.get("Retry-After") or 0), 30))
        if e.code in (401, 403): raise RuntimeError("balldontlie refused the key (HTTP %d); the free tier covers teams and games only" % e.code)
        raise RuntimeError("balldontlie: HTTP %d for %s" % (e.code, url.split("?")[0].rsplit("/v1", 1)[-1]))


def _get(path, params, key, sleep=time.sleep, base=None, limiter=None):
    """One GET through the shared limiter (limiter.py): one request at a time for the whole account (NBA, MLB and NFL, scheduled runs and
    admin requests alike), PAGE_GAP s after the previous one, an answer from the last minute reused, and every caller held off after a 429.
    `base` is the sport's API root (the NBA's is API; MLB and NFL are bdlsports.py's)."""
    url = (base or API) + path + ("?" + urllib.parse.urlencode(params, doseq=True, safe="[]") if params else "")
    lim = limiter or LM.default()
    for attempt in range(4):
        try:
            return lim.fetch(SOURCE, url, lambda: _request(url, key))[0]
        except Throttled as e:
            if attempt == 3: break
            lim.penalize(SOURCE, e.wait)
    raise RuntimeError("balldontlie: rate limited")


def fetch(season, since, raw_dir, state, key, today=None, sleep=time.sleep, get=_get):
    """Bring the cached season up to date. Whole season when none is cached or the last whole read is a week old, otherwise the
    games from `since` on. -> number of requests. A failure part way keeps what was read (games merge by id) and does not count as a
    whole read."""
    today = today or datetime.date.today()
    info = state.setdefault(SOURCE, {})
    cache = load_cache(raw_dir, season)
    last_full = info.get("full_at") if info.get("full_season") == season else None
    full = not cache["games"] or not last_full or (today - datetime.date.fromisoformat(last_full)).days >= FULL_EVERY_DAYS
    params = {"per_page": 100, "seasons[]": season}
    if not full: params.update(start_date=since.isoformat(), end_date=(today + datetime.timedelta(days=1)).isoformat())   # results: nothing later has one
    n, cursor = 0, None
    while True:
        d = get("/games", dict(params, **({"cursor": cursor} if cursor else {})), key)
        n += 1
        for g in d.get("data", []): cache["games"][str(g["id"])] = g
        cursor = (d.get("meta") or {}).get("next_cursor")
        if not cursor: break
    save_cache(raw_dir, cache)
    info["fetched_at"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if full: info["full_at"], info["full_season"] = today.isoformat(), season
    return n


def game_status(g):
    """final | scheduled | postponed for one balldontlie game (a game being played counts as scheduled until it ends)."""
    if g.get("postponed"): return "postponed"
    state = str(g.get("status_state") or "").lower()
    if state == "final" or str(g.get("status", "")).lower().startswith("final"): return "final"
    return "scheduled"


def claims_from(games, roster, season):
    """balldontlie game objects -> (claims, unreadable). A game with a team outside the table (a foreign club in a preseason game)
    is not an NBA game of the season and is skipped without a word; a team the table knows but the roster does not is unreadable."""
    claims, bad = [], []
    for g in sorted(games, key=lambda x: x["id"]):
        if g.get("season") != season: continue
        ht, vt = TEAMS.get(g["home_team"]["id"]), TEAMS.get(g["visitor_team"]["id"])
        if not ht or not vt: continue
        h, a = roster.by_name.get(T.norm(ht[1])), roster.by_name.get(T.norm(vt[1]))
        if not h or not a:
            bad.append((SOURCE, "%s / %s" % (ht[1], vt[1]))); continue
        status = game_status(g)
        score = {a["name"]: int(g["visitor_team_score"]), h["name"]: int(g["home_team_score"])} if status == "final" else None
        try: day = datetime.date.fromisoformat(str(g["date"])[:10])
        except ValueError:
            bad.append((SOURCE, "game %s: date %r" % (g["id"], g.get("date")))); continue
        # overtime: a fifth period is the first extra one; period 6 is the second ...
        ot = (int(g.get("period") or 4) > 4) if status == "final" else None
        c = P.claim(SOURCE, (a["name"], h["name"]), score, h["name"], day, status, "playoffs" if g.get("postseason") else "regular",
                    ot=ot, ot_n=(int(g["period"]) - 4) if ot else None, src=str(g["id"]))
        c["source"] = SOURCE
        start = P.utc_instant(g.get("datetime"))          # `date` is the day only; the clock is `datetime`. A missing one stays missing.
        if start: c["start"] = start
        claims.append(c)
    return claims, bad


def claims(season, roster, since, offline, raw_dir, state):
    """-> (claims, unreadable, requests), or (None, [], 0) when there is no key and nothing to do. `offline` reads the cache only."""
    key = None if offline else api_key()
    if not offline and not key: return None, [], 0
    n = fetch(season, since, raw_dir, state, key) if key else 0
    cache = load_cache(raw_dir, season)
    cs, bad = claims_from(list(cache["games"].values()), roster, season)
    sub = subset(raw_dir, season)
    for c in cs: c["revid"] = sub[1] if sub else None
    return cs, bad, n
