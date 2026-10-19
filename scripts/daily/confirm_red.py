#!/usr/bin/env python3
"""Confirm-only check of NHL final scores (AGENTS.md section 3, "Red sources are confirm-only"; sources.py tier red-confirm).

When Wikipedia's result for an NHL game is single-source or disputed, the NHL's score endpoint may be READ once per day of games to say whether it
agrees. The answer is compared in memory and discarded: it is not cached (the limiter's confirm() never caches), not archived, not loaded, not
logged, not written to any file. The only thing kept is an outcome row per game: our game id, outcome (agrees, disagrees, unavailable), the
`meta.verification` status it maps to (confirmed, disputed, not_found), the source code and checked_at. The row has no score and no value of
the NHL's (no `their_value`, no `evidence_url`).

    DAILY_CONFIRM_RED=1       the switch; off (anything else) means no request at all
    DAILY_CONFIRM_MAX=5       most requests (days) per run, newest days first; the rest are not checked

Rows go to <cache>/red-confirm.jsonl (append). Loading them into `meta.verification` needs the game's `core.game_id`, which only the build step
knows: that is a step for the coordinating session.
"""
import datetime, json, os, sys, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import limiter as LM, sources as SRC, teams as T, wikiapi as W

SOURCE = "nhl_api"
URL = "https://api-web.nhle.com/v1/score/%s"
STATUS = {"agrees": "confirmed", "disagrees": "disputed", "unavailable": "not_found"}
FINAL = ("FINAL", "OFF")


def enabled(env=None):
    return (os.environ if env is None else env).get("DAILY_CONFIRM_RED") == "1"


def max_requests(env=None):
    try: return max(0, int((os.environ if env is None else env).get("DAILY_CONFIRM_MAX", "5")))
    except ValueError: return 5


def candidates(games, league="nhl"):
    """A league's final games whose result only one source gave, or sources disagree on, newest day first."""
    out = [g for g in games if g.get("league") == league and g["status"] == "final" and g["confidence"] in ("single", "disputed")]
    return sorted(out, key=lambda g: g["date"], reverse=True)


def _http(url):
    """ONE GET (the caller holds the source's slot). -> parsed JSON. Raises Throttled on 429."""
    SRC.guard_url(url, purpose=SRC.CONFIRM_PURPOSE)
    req = urllib.request.Request(url, headers={"User-Agent": W.UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 429: raise Throttled(max(int(e.headers.get("Retry-After") or 0), 60))
        raise RuntimeError("HTTP %d" % e.code)


class Throttled(Exception):
    def __init__(self, wait): self.wait = wait


def _name(team):
    n = team.get("name")
    return T.norm((n.get("default") if isinstance(n, dict) else n) or "")


def _same(club, theirs):
    a = T.norm(club or "")
    return bool(a and theirs and (a == theirs or a.endswith(" " + theirs)))


def judge(game, payload):
    """-> 'agrees' | 'disagrees' | 'unavailable'. Looks at the answer, keeps nothing of it."""
    home, away = game.get("home"), game.get("away")
    if not home or not away or not game.get("score"): return "unavailable"
    for x in (payload or {}).get("games") or []:
        h, a = x.get("homeTeam") or {}, x.get("awayTeam") or {}
        if not (_same(home, _name(h)) and _same(away, _name(a))): continue
        if x.get("gameState") not in FINAL or h.get("score") is None or a.get("score") is None: return "unavailable"
        return "agrees" if (h["score"], a["score"]) == (game["score"].get(home), game["score"].get(away)) else "disagrees"
    return "unavailable"


def row(game, outcome, now, source=SOURCE):
    return dict(entity_kind="game", game_ref=game["source_key"], league=game["league"], season=game["season"], field="score",
                outcome=outcome, status=STATUS[outcome], source=source, checked_at=now.isoformat(timespec="seconds"))


def confirm(games, limiter=None, http=None, env=None, now=None, log=print):
    """-> (outcome rows, summary counts). With the switch off: ([], {}) and no request."""
    if not enabled(env): return [], {}
    todo = candidates(games)
    if not todo: return [], dict(requests=0, checked=0)
    lim, http, now = limiter or LM.default(), http or _http, now or datetime.datetime.now(datetime.timezone.utc)
    days = {}
    for g in todo: days.setdefault(g["date"], []).append(g)
    rows, requests, stop = [], 0, False
    for day in sorted(days, reverse=True):
        outcome = {}
        if requests < max_requests(env) and not stop:
            url = URL % day.isoformat()
            try:
                requests += 1
                payload = lim.confirm(SOURCE, "score " + day.isoformat(), lambda: http(url))
                for g in days[day]: outcome[g["source_key"]] = judge(g, payload)
                del payload
            except Throttled as e:
                lim.penalize(SOURCE, e.wait, SRC.CONFIRM_PURPOSE); stop = True
                outcome = {g["source_key"]: "unavailable" for g in days[day]}
            except Exception as e:
                log("confirm-only check of %s failed: %s" % (day.isoformat(), str(e)[:120]))
                outcome = {g["source_key"]: "unavailable" for g in days[day]}
        for g in days[day]:
            if g["source_key"] in outcome: rows.append(row(g, outcome[g["source_key"]], now))
    n = lambda o: sum(1 for r in rows if r["outcome"] == o)
    return rows, dict(requests=requests, checked=len(rows), agrees=n("agrees"), disagrees=n("disagrees"), unavailable=n("unavailable"), left_out=len(todo) - len(rows))


def save(rows, cache_dir):
    """Append the outcome rows (and nothing else) to <cache>/red-confirm.jsonl."""
    if not rows: return None
    os.makedirs(cache_dir, exist_ok=True)
    path = os.path.join(cache_dir, "red-confirm.jsonl")
    with open(path, "a", encoding="utf-8") as f:
        for r in rows: f.write(json.dumps(r, sort_keys=True) + "\n")
    return path
