#!/usr/bin/env python3
"""balldontlie, free tier: MLB and NFL games. An independent second source for the two leagues whose only other checks are the clubs'
Wikipedia articles (MLB) and those plus nflverse (NFL). The NBA is balldontlie.py; this file reuses its key, its request function and
its clock, so NBA + MLB + NFL together stay under the account's 5 requests a minute (every request waits for the shared limiter, PAGE_GAP s after the last one).

Documentation: https://docs.balldontlie.io ; MLB at https://mlb.balldontlie.io, NFL at https://nfl.balldontlie.io
  MLB  GET https://api.balldontlie.io/mlb/v1/games   seasons[], dates[], season_type=regular|postseason|spring_training, per_page <= 100, cursor
  NFL  GET https://api.balldontlie.io/nfl/v1/games   seasons[], dates[], season_types[]=1|2|3 (default 2 and 3), per_page <= 100, cursor
  both GET .../teams
Only the free tier's endpoints (games and teams) are used. Never call a paid endpoint and never start a trial.

There is NO start_date / end_date on MLB and NFL (a request with them is answered with the oldest games, unfiltered), and `dates[]` takes any
number of days, so a window is one request with the days listed (checked 2026-10-13). A `dates[]` day is the local (Eastern) day of the game;
a game's `date` is its start in UTC, so the club's local date is taken as that start minus 9 hours (a game starts between noon ET and 10:30 pm PT).

What is kept, as in balldontlie.py: the games as returned (each object verbatim), merged by id into one file in the raw cache,
`balldontlie/<league>/games-<season>.json`. The first run of a season, and one a week, reads the whole season (MLB: regular season 100 games a
page, about 25 requests, plus the postseason; NFL: about 3 requests); the other days only the days from `since` to tomorrow, in one request
(two for a busy MLB week). The archived bytes leave out fetch times, so the archive row changes only when a game does.
"""
import datetime, hashlib, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import balldontlie as B, parsers as P, teams as T

SOURCE = B.SOURCE
ROOT = "https://api.balldontlie.io"
FULL_EVERY_DAYS = B.FULL_EVERY_DAYS
LOCAL_SHIFT = datetime.timedelta(hours=9)
MAX_WINDOW_DAYS = 14                  # a longer --since than this reads the whole season instead

# balldontlie's team ids (GET /mlb/v1/teams and GET /nfl/v1/teams, checked 2026-10-13; fixtures/balldontlie_*_teams.json) -> abbreviation and the
# club's full name in DS1. Fixed on purpose: a team the table does not know is reported as unreadable, never guessed. The Athletics are
# balldontlie's "Oakland Athletics" (id 20); DS1 names the club as it is today. The self-test checks every row against the saved responses.
MLB_TEAMS = {
    1: ("ARI", "Arizona Diamondbacks"), 2: ("ATL", "Atlanta Braves"), 3: ("BAL", "Baltimore Orioles"), 4: ("BOS", "Boston Red Sox"),
    5: ("CHC", "Chicago Cubs"), 6: ("CHW", "Chicago White Sox"), 7: ("CIN", "Cincinnati Reds"), 8: ("CLE", "Cleveland Guardians"),
    9: ("COL", "Colorado Rockies"), 10: ("DET", "Detroit Tigers"), 11: ("HOU", "Houston Astros"), 12: ("KC", "Kansas City Royals"),
    13: ("LAA", "Los Angeles Angels"), 14: ("LAD", "Los Angeles Dodgers"), 15: ("MIA", "Miami Marlins"), 16: ("MIL", "Milwaukee Brewers"),
    17: ("MIN", "Minnesota Twins"), 18: ("NYM", "New York Mets"), 19: ("NYY", "New York Yankees"), 20: ("OAK", "Sacramento Athletics"),
    21: ("PHI", "Philadelphia Phillies"), 22: ("PIT", "Pittsburgh Pirates"), 23: ("SD", "San Diego Padres"), 24: ("SF", "San Francisco Giants"),
    25: ("SEA", "Seattle Mariners"), 26: ("STL", "St. Louis Cardinals"), 27: ("TB", "Tampa Bay Rays"), 28: ("TEX", "Texas Rangers"),
    29: ("TOR", "Toronto Blue Jays"), 30: ("WSH", "Washington Nationals"),
}
NFL_TEAMS = {
    1: ("NE", "New England Patriots"), 3: ("BUF", "Buffalo Bills"), 4: ("NYJ", "New York Jets"), 5: ("MIA", "Miami Dolphins"),
    6: ("BAL", "Baltimore Ravens"), 7: ("PIT", "Pittsburgh Steelers"), 8: ("CLE", "Cleveland Browns"), 9: ("CIN", "Cincinnati Bengals"),
    10: ("HOU", "Houston Texans"), 11: ("TEN", "Tennessee Titans"), 12: ("IND", "Indianapolis Colts"), 13: ("JAX", "Jacksonville Jaguars"),
    14: ("KC", "Kansas City Chiefs"), 15: ("DEN", "Denver Broncos"), 16: ("LV", "Las Vegas Raiders"), 17: ("LAC", "Los Angeles Chargers"),
    18: ("PHI", "Philadelphia Eagles"), 19: ("DAL", "Dallas Cowboys"), 20: ("NYG", "New York Giants"), 21: ("WSH", "Washington Commanders"),
    22: ("GB", "Green Bay Packers"), 23: ("MIN", "Minnesota Vikings"), 24: ("CHI", "Chicago Bears"), 25: ("DET", "Detroit Lions"),
    26: ("NO", "New Orleans Saints"), 27: ("ATL", "Atlanta Falcons"), 28: ("TB", "Tampa Bay Buccaneers"), 29: ("CAR", "Carolina Panthers"),
    30: ("SF", "San Francisco 49ers"), 31: ("SEA", "Seattle Seahawks"), 32: ("LAR", "Los Angeles Rams"), 33: ("ARI", "Arizona Cardinals"),
}

# per league: API root, team table, the key of the away side in a game object, how the full season is read (one parameter set per read)
SPORTS = {
    "mlb": dict(base=ROOT + "/mlb/v1", teams=MLB_TEAMS, away="away_team", full=[{"season_type": "regular"}, {"season_type": "postseason"}]),
    "nfl": dict(base=ROOT + "/nfl/v1", teams=NFL_TEAMS, away="visitor_team", full=[{}]),       # default season types 2 and 3: regular season and postseason
}


def title(league): return "games-%s.json" % league
def stem(league, season): return "games-%s-%d" % (league, season)
def state_key(league): return "%s_%s" % (SOURCE, league)


def cache_path(raw_dir, league, season):
    return os.path.join(raw_dir, SOURCE, league, "games-%d.json" % season)


def load_cache(raw_dir, league, season):
    path = cache_path(raw_dir, league, season)
    if not os.path.exists(path): return {"league": league, "season": season, "games": {}}
    with open(path, encoding="utf-8") as f: d = json.load(f)
    return {"league": league, "season": d.get("season", season), "games": {str(g["id"]): g for g in d.get("games", [])}}


def canonical(cache):
    """The bytes that are archived: the games as returned, ordered by id, with nothing that changes between identical fetches
    (an NFL game's `updated_at` does change, but only when the game does)."""
    body = {"source": SPORTS[cache["league"]]["base"] + "/games", "season": cache["season"], "games": [cache["games"][k] for k in sorted(cache["games"], key=int)]}
    return (json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode("utf-8")


def save_cache(raw_dir, cache):
    path = cache_path(raw_dir, cache["league"], cache["season"])
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f: f.write(canonical(cache))


def subset(raw_dir, league, season):
    """The season's cached games -> (bytes, sha256), or None when nothing is cached."""
    cache = load_cache(raw_dir, league, season)
    if not cache["games"]: return None
    data = canonical(cache)
    return data, hashlib.sha256(data).hexdigest()


def fetch(league, season, since, raw_dir, state, key, today=None, get=None):
    """Bring the cached season up to date: the whole season when none is cached or the last whole read is a week old (or `since` is
    more than MAX_WINDOW_DAYS back), otherwise the days from `since` to tomorrow in one request. -> number of requests. A failure part way
    keeps what was read (games merge by id) and does not count as a whole read. The pause between requests is the shared limiter's (limiter.py)."""
    get = get or B._get
    sp = SPORTS[league]
    today = today or datetime.date.today()
    info = state.setdefault(state_key(league), {})
    cache = load_cache(raw_dir, league, season)
    last_full = info.get("full_at") if info.get("full_season") == season else None
    full = (not cache["games"] or not last_full or (today - datetime.date.fromisoformat(last_full)).days >= FULL_EVERY_DAYS
            or (today - since).days > MAX_WINDOW_DAYS)
    base_params = {"per_page": 100, "seasons[]": season}
    if full: reads = [dict(base_params, **extra) for extra in sp["full"]]
    else:
        days = [(since + datetime.timedelta(days=i)).isoformat() for i in range((today + datetime.timedelta(days=1) - since).days + 1)]
        reads = [dict(base_params, **{"dates[]": days})]
    n = 0
    try:
        for params in reads:
            cursor = None
            while True:
                d = get("/games", dict(params, **({"cursor": cursor} if cursor else {})), key, base=sp["base"])
                n += 1
                for g in d.get("data", []):
                    if league == "mlb" and g.get("season_type") == "spring_training": continue      # not kept, not archived
                    cache["games"][str(g["id"])] = g
                cursor = (d.get("meta") or {}).get("next_cursor")
                if not cursor: break
    finally:
        if n: save_cache(raw_dir, cache)
    info["fetched_at"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if full: info["full_at"], info["full_season"] = today.isoformat(), season
    return n


def game_status(g):
    """final | scheduled | postponed | cancelled | suspended for one game (delayed and being played count as scheduled until it ends), or
    None for a state we do not read (abandoned, unknown)."""
    st = str(g.get("status_state") or "").lower()
    if st == "final": return "final"
    if st in ("scheduled", "in_progress", "delayed", ""): return "scheduled"
    if st == "postponed": return "postponed"
    if st in ("canceled", "cancelled"): return "cancelled"
    if st == "suspended": return "suspended"
    return None


def local_date(g):
    """The club's local date of the game: the UTC start minus 9 hours. A game with no time yet (NFL status "TBD", an MLB playoff game not
    yet placed) is stored at midnight Eastern, 04:00 or 05:00 UTC, and that is the right day already."""
    utc = datetime.datetime.fromisoformat(str(g["date"]).replace("Z", "+00:00"))
    if utc.hour in (4, 5) and utc.minute == 0 and game_status(g) != "final": return utc.date()
    return (utc - LOCAL_SHIFT).date()


def _score(league, g, side):
    if league == "mlb": return (g.get("%s_team_data" % ("home" if side == "home" else "away")) or {}).get("runs")
    return g.get("home_team_score" if side == "home" else "visitor_team_score")


def _overtime(league, g):
    """-> (overtime, periods beyond regulation) of a final game."""
    if league == "mlb":
        inn = int(g.get("period") or 9)
        return inn > 9, (inn - 9) if inn > 9 else None
    ot = g.get("home_team_ot") is not None or g.get("visitor_team_ot") is not None or str(g.get("status", "")).endswith("/OT")
    return ot, None


def claims_from(league, games, roster, season):
    """balldontlie game objects -> (claims, unreadable). Spring training games and games with a club that is not one (the All-Star Game, a
    playoff pairing not decided yet: team id -1) are not games of the season (skipped without a word); a
    team outside the table, a team the roster lacks, a final without both scores and a state we do not read are unreadable, never guessed."""
    sp = SPORTS[league]
    claims, bad = [], []
    for g in sorted(games, key=lambda x: x["id"]):
        if g.get("season") != season: continue
        if league == "mlb" and g.get("season_type") == "spring_training": continue
        if g["home_team"]["id"] < 0 or g[sp["away"]]["id"] < 0: continue      # the All-Star Game, or a playoff game whose clubs are not decided yet (id -1)
        ht, vt = sp["teams"].get(g["home_team"]["id"]), sp["teams"].get(g[sp["away"]]["id"])
        if not ht or not vt:
            bad.append((SOURCE, "game %s: team id %s / %s not in the table" % (g["id"], g["home_team"]["id"], g[sp["away"]]["id"]))); continue
        h, a = roster.by_name.get(T.norm(ht[1])), roster.by_name.get(T.norm(vt[1]))
        if not h or not a:
            bad.append((SOURCE, "%s / %s" % (ht[1], vt[1]))); continue
        status = game_status(g)
        if status is None:
            bad.append((SOURCE, "game %s: status %r" % (g["id"], g.get("status_state")))); continue
        hs, as_ = (_score(league, g, "home"), _score(league, g, "away")) if status == "final" else (None, None)
        if status == "final" and (hs is None or as_ is None):
            bad.append((SOURCE, "game %s: final without both scores" % g["id"])); continue
        score = {a["name"]: int(as_), h["name"]: int(hs)} if status == "final" else None
        try: day = local_date(g)
        except (ValueError, KeyError):
            bad.append((SOURCE, "game %s: date %r" % (g["id"], g.get("date")))); continue
        ot, ot_n = _overtime(league, g) if status == "final" else (None, None)
        c = P.claim(SOURCE, (a["name"], h["name"]), score, h["name"], day, status, "playoffs" if g.get("postseason") else "regular",
                    ot=ot, ot_n=ot_n, src=str(g["id"]))
        c["source"] = SOURCE
        c["_start"] = str(g["date"])
        start = P.utc_instant(g.get("date"), placeholder=True)   # the UTC start. 04:00Z and 05:00Z mean the time is not set yet.
        if start: c["start"] = start
        claims.append(c)
    if league == "mlb":     # balldontlie does not say which game of a doubleheader it is: the earlier start is the first
        byday = {}
        for c in claims: byday.setdefault((frozenset(c["teams"]), c["date"]), []).append(c)
        for cs in byday.values():
            if len(cs) == 2:
                for i, c in enumerate(sorted(cs, key=lambda c: (c["_start"], int(c["src"]))), 1): c["dh"] = i
    for c in claims: c.pop("_start", None)
    return claims, bad


def claims(league, season, roster, since, offline, raw_dir, state):
    """-> (claims, unreadable, requests), or (None, [], 0) when there is no key and nothing to do. `offline` reads the cache only."""
    key = None if offline else B.api_key()
    if not offline and not key: return None, [], 0
    n = fetch(league, season, since, raw_dir, state, key) if key else 0
    cache = load_cache(raw_dir, league, season)
    cs, bad = claims_from(league, list(cache["games"].values()), roster, season)
    sub = subset(raw_dir, league, season)
    for c in cs: c["revid"] = sub[1] if sub else None
    return cs, bad, n
