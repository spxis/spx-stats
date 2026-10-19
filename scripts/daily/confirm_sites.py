#!/usr/bin/env python3
"""Confirm-only checks of final scores against Yahoo Sports and USA TODAY (AGENTS.md section 3; sources.py tier red-confirm).

Same rules as confirm_red.py: when Wikipedia's result for a game is single-source or disputed, a public scoreboard page of the site may be READ to say
whether it agrees. The page is compared in memory and dropped: not cached (limiter.confirm never caches), not archived, not loaded, not logged, not
written to any file. The only thing kept is one outcome row per game (our game id, outcome agrees / disagrees / unavailable, the `meta.verification`
status it maps to, the source code, checked_at), the same row confirm_red.py writes. No score, no value of theirs.

    DAILY_CONFIRM_RED=1       the switch (shared with confirm_red.py); anything else means no request at all
    DAILY_CONFIRM_YAHOO=0     turns Yahoo off alone (anything but 0 leaves it on when the shared switch is on)
    DAILY_CONFIRM_USATODAY=0  turns USA TODAY off alone
    DAILY_CONFIRM_MAX=5       most requests per source and run (the variable confirm_red.py uses), newest days first; the rest are not checked

Leagues: NHL, NBA, MLB and NFL on both sites. Neither carries the CFL (Yahoo's CFL page has no games, USA TODAY has no CFL section), so a CFL game is
never asked about.

    Yahoo Sports   https://sports.yahoo.com/<league>/scoreboard/?date=YYYY-MM-DD: the page carries the day's games as data (`initialGames`; the NFL page
                   carries the whole week, keyed by day). One request per day of games; a day the answer already covers (the NFL week) costs none.
    USA TODAY      https://sportsdata.usatoday.com/<sport>/<league>/scores: the page carries the latest day of games (`__NEXT_DATA__`) and ignores a date
                   in the address, so there is ONE request per league and run, and only games on a day the answer covers are judged; the rest are
                   unavailable (no request is wasted on them).

A layout we do not recognise, a day the site did not answer for, a game not final there, a shootout (the sites do not say whether the shootout goal is in
their score), two games of the same clubs on one day, a missing score: all are `unavailable`, never `disagrees`. Redirects are not followed.
`combine()` joins the rows of every confirm-only source (confirm_red.py's NHL API included) into "N of M confirm-only sources agree" per game.
"""
import datetime, json, os, re, sys, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import confirm_red as CR, limiter as LM, sources as SRC, teams as T, wikiapi as W

CAP_BYTES = 4_000_000


class LayoutChanged(Exception):
    pass


def yahoo_url(league, day):
    return "https://sports.yahoo.com/%s/scoreboard/?date=%s" % (league, day.isoformat())


USAT_PATH = {"nhl": "hockey/nhl", "nba": "basketball/nba", "mlb": "baseball/mlb", "nfl": "football/nfl"}


def usatoday_url(league, day):
    return "https://sportsdata.usatoday.com/%s/scores" % USAT_PATH[league]


# ---------------------------------------------------------------------------------------------------- reading a page (pure)

def _num(v):
    return v if isinstance(v, int) and not isinstance(v, bool) else None


def _rec(day, final, comparable, a, b):
    """One game of a page, as much as the judge needs: its day, whether it is final and comparable, and (club name, score) of each side."""
    return dict(date=day, final=final, ok=comparable, teams=(a, b))


def parse_yahoo(html):
    """-> [records]. Raises LayoutChanged when the page does not carry the scoreboard data."""
    chunks = re.findall(r'<script>self\.__next_f\.push\(\[1,"(.*?)"\]\)</script>', html, re.S)
    try:
        text = "".join(json.loads('"' + c + '"') for c in chunks)
    except ValueError:
        raise LayoutChanged("scoreboard chunks unreadable")
    i = text.find('"initialGames":')
    if i < 0:
        raise LayoutChanged("no initialGames")
    try:
        data, _ = json.JSONDecoder().raw_decode(text[i + len('"initialGames":'):])
    except ValueError:
        raise LayoutChanged("initialGames unreadable")
    found = []

    def walk(o):
        if isinstance(o, dict):
            if "gameId" in o and "homeTeam" in o and "awayTeam" in o: found.append(o)
            else:
                for v in o.values(): walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    walk(data)
    out = []
    for g in found:
        h, a = g.get("homeTeam") or {}, g.get("awayTeam") or {}
        day = str(g.get("startDate") or "")[:10]
        if not (h.get("fullName") and a.get("fullName") and re.match(r"\d{4}-\d\d-\d\d$", day)):
            raise LayoutChanged("a game without teams or a day")
        final = str(g.get("status") or "").upper() == "FINAL"
        shootout = g.get("homeShootoutGoals") is not None or g.get("awayShootoutGoals") is not None
        hs, as_ = _num(g.get("homeScore")), _num(g.get("awayScore"))
        out.append(_rec(day, final, not shootout and hs is not None and as_ is not None, (T.norm(h["fullName"]), hs), (T.norm(a["fullName"]), as_)))
    return out


def parse_usatoday(html):
    """-> [records]. Raises LayoutChanged when the page does not carry the scoreboard data."""
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.S)
    if not m:
        raise LayoutChanged("no __NEXT_DATA__")
    try:
        events = json.loads(m.group(1))["props"]["pageProps"]["fallback"]["events"]["query"]
    except (ValueError, KeyError, TypeError):
        raise LayoutChanged("no events in __NEXT_DATA__")
    if not isinstance(events, list):
        raise LayoutChanged("events is not a list")
    out = []
    for e in events:
        try:
            day = next(d["simplifiedFull"] for d in e["startDate"] if d.get("type") == "Local")
            st = e.get("eventStatus") or {}
            sides = []
            for t, key in ((e["homeTeam"], "home"), (e["awayTeam"], "away")):
                name = t.get("teamName") or ("%s %s" % (t["location"], t["nickname"]))
                tm = next(x for x in e["teams"] if (x.get("teamLocationType") or {}).get("name") == key)
                score = _num(tm.get("score"))
                if score is None: score = _num((tm.get("lineScoreTotals") or {}).get("runs"))
                sides.append((T.norm(name), score))
        except (KeyError, StopIteration, TypeError, AttributeError):
            raise LayoutChanged("an event without teams, scores or a day")
        final = str(st.get("name") or "").lower().startswith("final")
        out.append(_rec(day, final, not st.get("isShootout") and all(s[1] is not None for s in sides), sides[0], sides[1]))
    return out


# ---------------------------------------------------------------------------------------------------- the judge

def judge(game, seen):
    """-> 'agrees' | 'disagrees' | 'unavailable'. `seen` are the records read this run; nothing of them is kept."""
    home, away = game.get("home"), game.get("away")
    if not home or not away or not game.get("score"): return "unavailable"
    want = (game["score"].get(home), game["score"].get(away))
    day = game["date"].isoformat()
    hit = []
    for r in seen:
        if r["date"] != day: continue
        (n1, s1), (n2, s2) = r["teams"]
        if CR._same(home, n1) and CR._same(away, n2): hit.append((r, s1, s2))
        elif CR._same(home, n2) and CR._same(away, n1): hit.append((r, s2, s1))
    if len(hit) != 1: return "unavailable"
    r, hs, as_ = hit[0]
    if not r["final"] or not r["ok"] or want[0] is None or want[1] is None: return "unavailable"
    return "agrees" if (hs, as_) == want else "disagrees"


# ---------------------------------------------------------------------------------------------------- the sites

SITES = {
    "yahoo_sports": dict(env="DAILY_CONFIRM_YAHOO", url=yahoo_url, parse=parse_yahoo, dated=True),
    "usatoday": dict(env="DAILY_CONFIRM_USATODAY", url=usatoday_url, parse=parse_usatoday, dated=False),
}


def enabled(source, env=None):
    e = os.environ if env is None else env
    return e.get("DAILY_CONFIRM_RED") == "1" and e.get(SITES[source]["env"]) != "0"


def _http(url):
    """ONE GET of a public page (the caller holds the source's slot) -> its text. No redirect is followed. Raises Throttled on 429 or 403."""
    SRC.guard_url(url, purpose=SRC.CONFIRM_PURPOSE)

    class Stay(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k): return None
    req = urllib.request.Request(url, headers={"User-Agent": W.UA, "Accept": "text/html"})
    try:
        with urllib.request.build_opener(Stay).open(req, timeout=30) as r:
            return r.read(CAP_BYTES).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code in (429, 403): raise CR.Throttled(max(int(e.headers.get("Retry-After") or 0), 60 if e.code == 429 else 3600))
        raise RuntimeError("HTTP %d" % e.code)


def _check(source, league, games, lim, http, env, now, log, used=0):
    """One source, one league -> (rows, requests). `used`: requests this source already made in the run (the cap is per source)."""
    site = SITES[source]
    days = {}
    for g in CR.candidates(games, league): days.setdefault(g["date"], []).append(g)
    rows, requests, stop, seen, read = [], 0, False, [], False
    covered = lambda d: any(r["date"] == d.isoformat() for r in seen)
    for day in sorted(days, reverse=True):
        outcome = None
        if not covered(day):
            if stop or (read and not site["dated"]):
                outcome = "unavailable" if read and not stop else None     # the one page of an undated site has been read: nothing more to learn; after a stop: not asked
            elif used + requests < CR.max_requests(env):
                url = site["url"](league, day)
                try:
                    requests += 1
                    page = lim.confirm(source, "%s %s" % (league, day.isoformat()), lambda: http(url))
                    seen += site["parse"](page)
                    read = True
                    del page
                    outcome = "judge"
                except CR.Throttled as e:
                    lim.penalize(source, e.wait, SRC.CONFIRM_PURPOSE); stop = True; outcome = "unavailable"
                except LayoutChanged as e:
                    log("confirm-only check of %s %s %s: layout not recognised (%s)" % (source, league, day.isoformat(), str(e)[:80]))
                    stop = True; outcome = "unavailable"
                except Exception as e:
                    log("confirm-only check of %s %s %s failed: %s" % (source, league, day.isoformat(), str(e)[:120]))
                    outcome = "unavailable"
        else:
            outcome = "judge"
        if outcome:
            for g in days[day]: rows.append(CR.row(g, judge(g, seen) if outcome == "judge" else outcome, now, source))
    return rows, requests


def confirm(all_games, limiter=None, http=None, env=None, now=None, log=print):
    """-> (outcome rows, {source: counts}). `all_games` is {league: [games]}. Each site that is off asks nothing; with the shared switch off: ([], {})."""
    on = [s for s in SITES if enabled(s, env)]
    if not on: return [], {}
    lim, http, now = limiter or LM.default(), http or _http, now or datetime.datetime.now(datetime.timezone.utc)
    rows, summary = [], {}
    for source in on:
        mine, requests, left = [], 0, 0
        for league in sorted(set(SRC.SOURCES[source]["leagues"]) & set(all_games)):
            got, n = _check(source, league, all_games[league], lim, http, env, now, log, requests)
            mine += got; requests += n
            left += len(CR.candidates(all_games[league], league)) - len(got)
        c = lambda o: sum(1 for r in mine if r["outcome"] == o)
        summary[source] = dict(requests=requests, checked=len(mine), agrees=c("agrees"), disagrees=c("disagrees"), unavailable=c("unavailable"), left_out=left)
        rows += mine
    return rows, summary


def combine(rows):
    """Outcome rows of every confirm-only source -> {game_ref: {asked, agrees, disagrees, unavailable, early, text}}.
    `early`: two or more sources agree and none disagrees. Counts and the sentence only; no value of theirs."""
    out = {}
    for r in rows:
        c = out.setdefault(r["game_ref"], dict(asked=0, agrees=0, disagrees=0, unavailable=0))
        c["asked"] += 1
        c[r["outcome"]] += 1
    for c in out.values():
        c["early"] = c["agrees"] >= 2 and c["disagrees"] == 0
        c["text"] = "%d of %d confirm-only sources agree%s" % (c["agrees"], c["asked"], ", %d disagree" % c["disagrees"] if c["disagrees"] else "")
    return out
