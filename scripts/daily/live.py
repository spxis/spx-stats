#!/usr/bin/env python3
"""The live score layer: provisional results in Turso, written only here, only on the NAS (standard library only).

One small table, `live_score`, one row per core.game (game_id), holding a result the allowed sources have already given while the careful path
(the daily job, DS1, a data release) has not settled it. The site reads it as an overlay with an "unofficial" badge (web/src/lib/turso/live.ts).
It is never written to DS1 or production Postgres and is never part of a data release.

What goes in, and what never does:
  - A score comes only from a source whose registry tier is green or grey (sources.require) and which may be stored (sources.assert_storable).
    A red or confirm-only source cannot contribute a score: the claim is dropped before it is counted.
  - Confirm-only outcomes (confirm_red.py, confirm_sites.py) arrive as outcome rows (agrees / disagrees / unavailable). Only two COUNTS are kept
    (`confirm_agree`, `confirm_differ`). They are flags: they do not count in "N of M sources agree" and carry no score.
  - Agreement: the allowed sources that gave a result vote by score. `n_agree` is the size of the biggest group out of `n_sources`; two groups of
    the same size is `disputed` (shown with both scores, never silently picked). `ready` = all sources agree and no outside check differs: the
    only rows the careful path may be offered as "ready to settle".
  - Forward only: scheduled < in_progress < final. A lower state never replaces a higher one; a final row is never changed (a correction goes
    through the careful path); an in-progress row may change its score. The rule is one SQL statement, so two writers cannot break it.
  - Games core.game already holds as final are not written (and their live row is deleted): the settled result is authoritative.
  - Retention: a row goes when core.game settles it, or when it is 7 days old.

Writing is one pipeline request per 100 games; each game has its own statements and its own outcome (updated, unchanged, held, failed), so one bad
game never stops the rest. A row is rewritten only when its signature (status, scores, each source's score, outside-check counts) changed.

    python3 -I scripts/daily/live.py status       # rows in the table, by state
    python3 -I scripts/daily/live.py stale        # rows older than 2 days that were never settled
    python3 -I scripts/daily/live.py sweep        # delete rows older than 7 days
    python3 -I scripts/daily/run.py --dry-run --live --league nhl    # fetch (through the limiter), build games, publish the live rows

Environment (names only): TURSO_DATABASE_URL and TURSO_RUNLOG_TOKEN (a token that can write; TURSO_AUTH_TOKEN when not set), as scripts/runlog.
`--live` on run.py, or DAILY_LIVE=1 for the daily job. Nothing here makes a request to a score source: the fetching is run.py's, through the limiter.
"""
import datetime, hashlib, json, os, sys, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "runlog"))
import sources as SRC

RANK = {"scheduled": 0, "in_progress": 1, "final": 2}
KEEP_DAYS = 7
STALE_DAYS = 2
CHUNK = 100
TIMEOUT = 20

SCHEMA = [
    "create table if not exists live_score (game_id integer primary key, league text not null, game_date text not null, status text not null, rank integer not null, "
    "home_score integer, away_score integer, overtime integer, period text, disputed integer not null default 0, ready integer not null default 0, "
    "n_sources integer not null, n_agree integer not null, confirm_agree integer not null default 0, confirm_differ integer not null default 0, "
    "sources text not null, sig text not null, fetched_at text not null, updated_at text not null)",
    "create index if not exists live_score_day on live_score (league, game_date)",
    "create table if not exists live_request (id integer primary key, requested_by text not null, scope text not null, league text, game_day text, game_id integer, "
    "sources text, status text not null, started_at text not null, finished_at text, summary text, items text)",
]

UPSERT = (
    "insert into live_score (game_id, league, game_date, status, rank, home_score, away_score, overtime, period, disputed, ready, n_sources, n_agree, confirm_agree, "
    "confirm_differ, sources, sig, fetched_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) "
    "on conflict(game_id) do update set league = excluded.league, game_date = excluded.game_date, status = excluded.status, rank = excluded.rank, "
    "home_score = excluded.home_score, away_score = excluded.away_score, overtime = excluded.overtime, period = excluded.period, disputed = excluded.disputed, "
    "ready = excluded.ready, n_sources = excluded.n_sources, n_agree = excluded.n_agree, confirm_agree = excluded.confirm_agree, confirm_differ = excluded.confirm_differ, "
    "sources = excluded.sources, sig = excluded.sig, fetched_at = excluded.fetched_at, updated_at = excluded.updated_at "
    "where live_score.sig <> excluded.sig and (live_score.rank < excluded.rank or (live_score.rank = excluded.rank and live_score.status <> 'final'))"
)
# A final row is frozen, but when the same score arrives with new evidence (another source, an outside check) the evidence is refreshed.
EVIDENCE = (
    "update live_score set disputed = ?, ready = ?, n_sources = ?, n_agree = ?, confirm_agree = ?, confirm_differ = ?, sources = ?, sig = ?, fetched_at = ?, updated_at = ? "
    "where game_id = ? and status = 'final' and home_score is ? and away_score is ? and sig <> ?"
)


def now_iso(now=None):
    return (now or datetime.datetime.now(datetime.timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------------------------------- the rule (pure)

def registry_id(claim_source):
    """The registry id behind a claim's source: 'wp:<article>' is English Wikipedia, the others are their own id."""
    return "wikipedia" if str(claim_source).startswith("wp:") else str(claim_source)


def label(claim_source):
    s = str(claim_source)
    return "Wikipedia: " + s[3:] if s.startswith("wp:") else s


def allowed(claim_source, purpose="daily"):
    """Whether this source may give a score to the live layer: green or grey for this purpose, and storable. Never a red or confirm-only source."""
    try:
        SRC.require(registry_id(claim_source), None, purpose)
        SRC.assert_storable(registry_id(claim_source))
        return True
    except SRC.SourceRefused:
        return False


def tally(claims, fid_of, hf, af, purpose="daily", fetched=None, now=None):
    """The allowed sources' results for one game, oriented to core's home (franchise hf) and away (af).

    claims: the game's claims (parsers.claim dicts). fid_of(club name) -> franchise id or None. fetched(claim) -> ISO time or None.
    -> dict(status, home_score, away_score, disputed, n_sources, n_agree, sources=[...], overtime) or None when no allowed source has a result."""
    seen, votes = {}, []
    for c in claims:
        st = c.get("status")
        if st not in ("final", "in_progress") or not c.get("score") or not allowed(c["source"], purpose):
            continue
        by = {}
        for team, n in c["score"].items():
            f = fid_of(team)
            if f is not None: by[f] = n
        if hf not in by or af not in by or c["source"] in seen:
            continue
        seen[c["source"]] = 1
        votes.append(dict(source=c["source"], status=st, h=by[hf], a=by[af], at=(fetched(c) if fetched else None) or now_iso(now), ot=c.get("ot")))
    if not votes:
        return None
    status = "final" if any(v["status"] == "final" for v in votes) else "in_progress"
    votes = [v for v in votes if v["status"] == status]
    groups = {}
    for v in votes: groups.setdefault((v["h"], v["a"]), []).append(v)
    size = max(len(g) for g in groups.values())
    top = [k for k, g in groups.items() if len(g) == size]
    disputed = len(top) > 1
    home, away = (None, None) if disputed else top[0]
    ot = [v["ot"] for v in votes if v["ot"] is not None and (v["h"], v["a"]) == (home, away)]
    return dict(status=status, home_score=home, away_score=away, disputed=disputed, n_sources=len(votes), n_agree=size,
                overtime=None if not ot else any(ot), period=None,
                sources=[dict(s=label(v["source"]), h=v["h"], a=v["a"], at=v["at"]) for v in sorted(votes, key=lambda v: v["source"])])


def confirm_counts(rows, game_ref):
    """(agree, differ) among the confirm-only outcome rows for one game. Counts only: the rows hold no value of the outside source."""
    got = [r for r in rows if r.get("game_ref") == game_ref]
    return sum(1 for r in got if r.get("outcome") == "agrees"), sum(1 for r in got if r.get("outcome") == "disagrees")


def signature(t, agree, differ):
    """What a reader could see change: not the fetch times."""
    body = [t["status"], t["home_score"], t["away_score"], t["overtime"], t["disputed"], agree, differ, [[s["s"], s["h"], s["a"]] for s in t["sources"]]]
    return hashlib.sha1(json.dumps(body, sort_keys=True).encode()).hexdigest()[:16]


def make_row(game_id, league, game_date, t, agree, differ, now=None):
    ready = bool(not t["disputed"] and t["n_agree"] == t["n_sources"] and t["status"] == "final" and not differ)
    at = max(s["at"] for s in t["sources"])
    return dict(game_id=int(game_id), league=league, game_date=str(game_date), status=t["status"], rank=RANK[t["status"]], home_score=t["home_score"], away_score=t["away_score"],
                overtime=None if t["overtime"] is None else int(t["overtime"]), period=t.get("period"), disputed=int(t["disputed"]), ready=int(ready), n_sources=t["n_sources"],
                n_agree=t["n_agree"], confirm_agree=agree, confirm_differ=differ, sources=json.dumps(t["sources"], separators=(",", ":"), ensure_ascii=False),
                sig=signature(t, agree, differ), fetched_at=at, updated_at=now_iso(now))


COLS = ["game_id", "league", "game_date", "status", "rank", "home_score", "away_score", "overtime", "period", "disputed", "ready", "n_sources", "n_agree",
        "confirm_agree", "confirm_differ", "sources", "sig", "fetched_at", "updated_at"]


def statements(row):
    ev = [row[k] for k in ("disputed", "ready", "n_sources", "n_agree", "confirm_agree", "confirm_differ", "sources", "sig", "fetched_at", "updated_at", "game_id", "home_score", "away_score", "sig")]
    return [(UPSERT, [row[k] for k in COLS]), (EVIDENCE, ev)]


def decide(plan, affected, current):
    """-> (outcome, reason) for one game from what the two statements changed and the row now in the table (sig, status) or None."""
    if affected[0]: return "updated", "%s result written" % plan["status"]
    if affected[1]: return "updated", "score unchanged, evidence refreshed"
    if current is None: return "failed", "the row is not in the table"
    if current == plan["sig"]: return "unchanged", "nothing new"
    return "held", "forward only: the row already holds a later or final result; a correction goes through the careful path"


# ---------------------------------------------------------------------------------------------------- Turso

def _arg(v):
    if v is None: return {"type": "null"}
    if isinstance(v, bool): return {"type": "integer", "value": str(int(v))}
    if isinstance(v, int): return {"type": "integer", "value": str(v)}
    if isinstance(v, float): return {"type": "float", "value": v}
    return {"type": "text", "value": str(v)}


class Turso:
    """The HTTP pipeline, with a result for each statement (a statement that fails does not stop the ones after it)."""

    def __init__(self, endpoint=None, token=None, timeout=TIMEOUT):
        if endpoint is None:
            import runlog
            cfg = runlog.config()
            if cfg is None: raise RuntimeError("Turso is not configured (TURSO_DATABASE_URL)")
            endpoint, token = cfg
        self.endpoint, self.token, self.timeout = endpoint, token or "", timeout
        self.requests = 0

    def run(self, stmts):
        """[(sql, args)] -> [(ok, result dict or error text)], one per statement."""
        body = json.dumps({"requests": [{"type": "execute", "stmt": {"sql": s, "args": [_arg(a) for a in args]}} for s, args in stmts] + [{"type": "close"}]}).encode()
        req = urllib.request.Request(self.endpoint, data=body, headers={"content-type": "application/json", **({"authorization": "Bearer " + self.token} if self.token else {})})
        self.requests += 1
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                data = json.loads(r.read())
        except urllib.error.HTTPError as e:
            raise RuntimeError("turso answered %d" % e.code)
        out = []
        for res in data.get("results", [])[:len(stmts)]:
            if res.get("type") == "ok": out.append((True, res["response"]["result"]))
            else: out.append((False, str((res.get("error") or {}).get("message", "error"))[:200]))
        return out

    def rows(self, sql, args=()):
        ok, res = self.run([(sql, list(args))])[0]
        if not ok: raise RuntimeError(res)
        cols = [c["name"] for c in res["cols"]]
        return [dict(zip(cols, [c.get("value") if c.get("type") != "null" else None for c in r])) for r in res["rows"]]


def ensure(t):
    for ok, res in t.run([(s, []) for s in SCHEMA]):
        if not ok: raise RuntimeError(res)


def write(t, rows):
    """Write the live rows. -> {game_id: (outcome, reason)}. One bad game never stops the rest."""
    out = {}
    for i in range(0, len(rows), CHUNK):
        part = rows[i:i + CHUNK]
        stmts = [s for r in part for s in statements(r)]
        ids = ",".join(str(int(r["game_id"])) for r in part)
        stmts.append(("select game_id, sig from live_score where game_id in (%s)" % ids, []))
        try:
            res = t.run(stmts)
        except Exception as e:
            for r in part: out[r["game_id"]] = ("failed", "Turso did not answer: %s" % str(e)[:120])
            continue
        now = {}
        if len(res) == len(stmts) and res[-1][0]:
            cols = [c["name"] for c in res[-1][1]["cols"]]
            for rw in res[-1][1]["rows"]:
                d = dict(zip(cols, [c.get("value") for c in rw]))
                now[int(d["game_id"])] = d["sig"]
        for k, r in enumerate(part):
            up, ev = res[2 * k] if 2 * k < len(res) else (False, "no answer"), res[2 * k + 1] if 2 * k + 1 < len(res) else (False, "no answer")
            if not up[0] or not ev[0]:
                out[r["game_id"]] = ("failed", str(up[1] if not up[0] else ev[1])[:160]); continue
            aff = (up[1].get("affected_row_count", 0) > 0, ev[1].get("affected_row_count", 0) > 0)
            out[r["game_id"]] = decide(r, aff, now.get(r["game_id"]))
    return out


def sweep(t, settled=(), now=None, keep_days=KEEP_DAYS):
    """Delete rows core has settled and rows older than `keep_days` (and the admin requests that old). -> (settled deleted, old deleted)."""
    cutoff = now_iso((now or datetime.datetime.now(datetime.timezone.utc)) - datetime.timedelta(days=keep_days))
    stmts = [("delete from live_score where updated_at < ?", [cutoff]), ("delete from live_request where started_at < ?", [cutoff])]
    ids = sorted({int(x) for x in settled})
    for i in range(0, len(ids), CHUNK):
        stmts.append(("delete from live_score where game_id in (%s)" % ",".join(str(x) for x in ids[i:i + CHUNK]), []))
    res = t.run(stmts)
    n = lambda x: x[1].get("affected_row_count", 0) if x[0] else 0
    return sum(n(x) for x in res[2:]), n(res[0])


def stale(t, now=None):
    cutoff = now_iso((now or datetime.datetime.now(datetime.timezone.utc)) - datetime.timedelta(days=STALE_DAYS))
    return t.rows("select game_id, league, game_date, status, updated_at from live_score where updated_at < ? order by game_date", [cutoff])


# ---------------------------------------------------------------------------------------------------- publishing a run

def core_games(leagues_seasons, since, ds1_csv=None):
    """{league: [core games since `since`]} in the shape compare.match wants. Read-only SELECT on DS1."""
    import teams as T
    ds1_csv = ds1_csv or T.ds1_csv
    pairs = ",".join("('%s',%d)" % (lg, y) for lg, y in leagues_seasons.items())
    rows = ds1_csv(
        "select s.league_code, g.game_id, g.phase, g.game_date, g.status, hts.franchise_id hf, ats.franchise_id af, g.home_score hs, g.away_score aws, "
        "g.went_to_overtime ot, g.decided_by_shootout so, g.source_key, src.code src "
        "from core.game g join core.season s using (season_id) join core.team_season hts on hts.team_season_id = g.home_team_season_id "
        "join core.team_season ats on ats.team_season_id = g.away_team_season_id join meta.source src on src.source_id = g.source_id "
        "where (s.league_code, s.start_year) in (%s) and g.game_date >= '%s'" % (pairs, since.isoformat()))
    out = {lg: [] for lg in leagues_seasons}
    for r in rows:
        out[r["league_code"]].append(dict(
            id=int(r["game_id"]), phase=r["phase"], date=datetime.date.fromisoformat(r["game_date"]), status=r["status"], hf=int(r["hf"]), af=int(r["af"]),
            hs=int(r["hs"]) if r["hs"] != "" else None, as_=int(r["aws"]) if r["aws"] != "" else None,
            ot=r["ot"] == "t", so=r["so"] == "t", key=r["source_key"], src=r["src"], used=False))
    return out


def plan(all_games, rosters, core, confirm_rows, since, until, purpose="daily", fetched=None, now=None, only_ids=None, notes=None):
    """Games of the run -> (rows to write, settled game ids, skipped [(label, reason)]). Pure: `core` is core_games()'s answer.
    `only_ids` limits the run to those core game ids (an admin's one-game refresh); `notes`, when a list, collects one dict(game_id, reason) for every
    asked-about game that was left out, so the request can say why."""
    import compare
    rows, settled, skipped = [], [], []
    for lg, games in all_games.items():
        roster = rosters[lg]
        fid_of = lambda n, roster=roster: (roster.resolve(n) or {}).get("fid")
        wanted = [g for g in games if since <= g["date"] <= until]
        try:
            pairs, _ = compare.match(wanted, core.get(lg, []), roster)
        except Exception as e:
            skipped.append((lg, "could not be matched with core.game: %s" % str(e)[:100])); continue
        for g, d in pairs:
            tag = "%s %s %s" % (lg.upper(), g["date"], " v ".join(g["teams"]))

            def skip(reason, d=d, tag=tag):
                skipped.append((tag, reason))
                if notes is not None and d is not None: notes.append(dict(game_id=d["id"], reason=reason))
            try:
                if d is None: skipped.append((tag, "not in core.game")); continue
                if only_ids is not None and d["id"] not in only_ids: continue
                t = tally(g["claims"], fid_of, d["hf"], d["af"], purpose, fetched, now)
                if t is None: skip("no allowed source has a result"); continue
                if d["status"] == "final":
                    if (t["home_score"], t["away_score"]) == (d["hs"], d["as_"]): settled.append(d["id"])
                    skip("core.game already holds the final result"); continue
                ag, df = confirm_counts(confirm_rows, g["source_key"])
                rows.append(make_row(d["id"], lg, d["date"].isoformat(), t, ag, df, now))
            except Exception as e:      # one game that cannot be read costs that game only
                skip("%s: %s" % (type(e).__name__, str(e)[:120]))
    return rows, settled, skipped


def fetched_from_state(state):
    """fetched(claim) -> when the cached source was last downloaded, from run.py's state file."""
    def f(c):
        s = c["source"]
        info = (state.get("pages", {}).get(c.get("page")) if s.startswith("wp:") else state.get(s)) or {}
        return info.get("fetched_at")
    return f


def publish(all_games, rosters, seasons, confirm_rows, state=None, purpose="daily", turso=None, core=None, since=None, until=None, today=None, log=print, only_ids=None, asked=None):
    """Called by run.py with --live. -> a summary dict for the run log. Never raises: a failure here must not fail the daily job.
    `asked` (an admin's request) is the list of core game ids the request is about; the summary then carries `items`, one outcome per asked game."""
    today = today or datetime.date.today()
    since, until = since or today - datetime.timedelta(days=3), until or today + datetime.timedelta(days=1)
    try:
        t = turso or Turso()
        ensure(t)
        core = core if core is not None else core_games(seasons, since)
    except Exception as e:
        log("live scores: not published: %s" % str(e)[:200])
        return dict(published=False, reason=str(e)[:200])
    notes = []
    rows, settled, skipped = plan(all_games, rosters, core, confirm_rows or [], since, until, purpose, fetched_from_state(state or {}), only_ids=only_ids, notes=notes)
    results = write(t, rows) if rows else {}
    gone = (0, 0)
    try:
        gone = sweep(t, settled)
    except Exception as e:
        log("live scores: sweep failed: %s" % str(e)[:120])
    n = lambda k: sum(1 for o, _ in results.values() if o == k)
    summary = dict(published=True, games=len(rows), updated=n("updated"), unchanged=n("unchanged"), held=n("held"), failed=n("failed"), skipped=len(skipped),
                   settled_deleted=gone[0], old_deleted=gone[1], turso_requests=t.requests)
    log("live scores: %d game(s): %d updated, %d unchanged, %d held, %d failed; %d skipped; deleted %d settled and %d old (%d Turso request(s))" % (
        len(rows), summary["updated"], summary["unchanged"], summary["held"], summary["failed"], len(skipped), gone[0], gone[1], t.requests))
    for gid, (o, why) in results.items():
        if o in ("held", "failed"): log("     game %s %s: %s" % (gid, o, why))
    if asked is not None:
        summary["items"] = items_for(asked, results, notes)
    return summary


# ---------------------------------------------------------------------------------------------------- an admin's request

ITEM_MAX = 120      # games listed on a request's progress row
OUTCOMES = ("updated", "unchanged", "held", "failed", "skipped")


def items_for(asked, results, notes):
    """One entry per asked-about game: [game_id, outcome, reason]. Written results first, then the reasons a game was left out, then the games no source gave."""
    why = {}
    for x in notes: why.setdefault(x["game_id"], x["reason"])
    out = []
    for gid in asked:
        if gid in results: o, r = results[gid]
        else: o, r = "skipped", why.get(gid, "no chosen source gave a result for this game")
        out.append([int(gid), o, str(r)[:100]])
    order = {"failed": 0, "held": 1, "updated": 2, "unchanged": 3, "skipped": 4}
    return sorted(out, key=lambda x: (order.get(x[1], 9), x[0]))[:ITEM_MAX]


def locate(game_id=None, day=None, leagues=(), ds1_csv=None):
    """Where an admin's request points, from DS1 (a read-only select): {league: dict(season, ids [core game ids], fids {franchise ids of the clubs playing})}.
    One game by its core game id, or every game of `leagues` on `day` (YYYY-MM-DD)."""
    import teams as T
    ds1_csv = ds1_csv or T.ds1_csv
    if game_id is not None: cond = "g.game_id = %d" % int(game_id)
    else:
        datetime.date.fromisoformat(day)
        cond = "g.game_date = '%s' and s.league_code in (%s)" % (day, ",".join("'%s'" % x for x in leagues if x.isalnum()))
    rows = ds1_csv(
        "select s.league_code, s.start_year, g.game_id, g.game_date, hts.franchise_id hf, ats.franchise_id af from core.game g join core.season s using (season_id) "
        "join core.team_season hts on hts.team_season_id = g.home_team_season_id join core.team_season ats on ats.team_season_id = g.away_team_season_id where " + cond)
    out = {}
    for r in rows:
        x = out.setdefault(r["league_code"], dict(season=int(r["start_year"]), ids=[], fids=set(), date=r["game_date"]))
        x["ids"].append(int(r["game_id"])); x["fids"] |= {int(r["hf"]), int(r["af"])}
    return out


def request_start(t, req, now=None):
    """The progress row of an admin request, 'running'. req: dict(id, by, scope, league, day, game, sources). -> True when written. Never raises."""
    try:
        ensure(t)
        ok, res = t.run([("insert into live_request (id, requested_by, scope, league, game_day, game_id, sources, status, started_at) values (?,?,?,?,?,?,?,'running',?) "
                          "on conflict(id) do update set status = 'running', started_at = excluded.started_at, finished_at = null, summary = null, items = null",
                          [int(req["id"]), str(req["by"])[:80], req["scope"], req.get("league"), req.get("day"), req.get("game"), ",".join(req.get("sources") or []) or None, now_iso(now)])])[0]
        return ok
    except Exception:
        return False


def request_finish(t, req_id, status, summary, items=None, now=None):
    """The end of an admin request: status done | failed | nothing, a one-line summary, and the per-game outcomes. Never raises."""
    try:
        ok, _ = t.run([("update live_request set status = ?, finished_at = ?, summary = ?, items = ? where id = ?",
                        [status, now_iso(now), str(summary)[:400], json.dumps(items, separators=(",", ":")) if items is not None else None, int(req_id)])])[0]
        return ok
    except Exception:
        return False


def main(argv):
    cmd = argv[0] if argv else ""
    if cmd in ("status", "stale", "sweep"):
        t = Turso(); ensure(t)
        if cmd == "status":
            for r in t.rows("select status, count(*) n, min(game_date) first, max(game_date) last from live_score group by status"): print(r)
        elif cmd == "stale":
            for r in stale(t): print(r)
        else:
            print("deleted %d settled, %d old" % sweep(t))
        return 0
    print(__doc__.strip().split("\n")[0]); return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
