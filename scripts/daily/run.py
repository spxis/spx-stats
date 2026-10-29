#!/usr/bin/env python3
"""Daily scores from Wikipedia (CC BY-SA 4.0) and the allowed second sources.

  run.py --dry-run [--league nhl,nba,mlb,nfl,cfl] [--state PATH] [--raw-dir DIR] [--offline] [--no-ds1] [--json OUT] [-v]
         STAGE 1, the default: fetch, parse, cross-check, compare with DS1. Read-only.
  run.py --rehearse   as --apply, but stops after the rehearsal (one DS1 transaction that ends in ROLLBACK)
  run.py --apply      STAGE 2: rehearse, then write to DS1 only: archive, raw load, db/build/152, checks (see apply.py)
  run.py --self-test

What a run does (see README.md):
  1. current clubs per league (DS1, cached), the season each league is in today
  2. one `revisions` call per 50 pages: the latest revision id of every team-season article
  3. download only the pages whose revision id differs from the state file (10 pages per request)
  4. parse every cached page to claims, pair the two clubs' claims into games, cross-check (nflverse for the NFL;
     balldontlie for the NBA, MLB and NFL when its key is set: the NBA schedule for a season the articles do not carry yet,
     an independent second source for MLB and NFL games; one request at a time, 13 s apart, whatever the sport)
  5. compare with DS1's core.game and print the summary. A dry run writes nothing; --apply writes to DS1 (never production).

Forbidden sources (never fetched, even to test): NBA.com / cdn.nba.com, NFL.com, cfl.ca, ESPN, Sports Reference, newspapers
and TV sites. NHL API, MLB statsapi, stats.nba.com, stats.wnba.com, the PWHL feed, Yahoo Sports and USA TODAY are confirm-only (confirm_red.py, confirm_sites.py,
DAILY_CONFIRM_RED=1): read to confirm, never stored.
"""
import argparse, collections, csv, datetime, hashlib, io, json, os, re, sys, time, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import balldontlie as B, bdlsports as S, confirm_red as CR, confirm_sites as CS, games as G, limiter as LM, parsers as P, sources as SRC, teams as T, wikiapi as W

CACHE = os.path.expanduser(os.environ.get("SPX_DAILY_CACHE", "~/Library/Caches/spx-stats-daily"))
LEAGUES = ["nhl", "nba", "mlb", "nfl", "cfl"]
LIVE_SOURCES = ("wikipedia", "balldontlie", "nflverse")      # the sources that give a score today (an admin's refresh may tick some of them)
TITLE_ALIAS = {("mlb", "Sacramento Athletics"): "Athletics"}   # Wikipedia's article name, where it differs from the club's full name
NFLVERSE_URL = "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv"
UA = W.UA


def season_now(league, today):
    """Start year of the season a league is in on `today`."""
    y, m = today.year, today.month
    if league in ("nhl", "nba"): return y if m >= 8 else y - 1
    if league == "mlb": return y if m >= 2 else y - 1
    if league == "nfl": return y if m >= 3 else y - 1
    return y


def season_label(league, y):
    return "%d–%02d" % (y, (y + 1) % 100) if league in ("nhl", "nba") else str(y)


def plan(league, y, roster):
    """Pages to watch for one league-season: every club's season article, plus the league postseason page (MLB)."""
    lab = season_label(league, y)
    pages = []
    for c in roster.clubs:
        nm = TITLE_ALIAS.get((league, c["name"]), T.unaccent(c["name"]))
        pages.append(dict(league=league, season=y, kind="team", team=c["name"], title="%s %s season" % (lab, nm)))
    if league == "mlb":
        pages.append(dict(league=league, season=y, kind="league", team=None, title="%d Major League Baseball postseason" % y))
    return pages


def safe(title): return re.sub(r"[^A-Za-z0-9._-]+", "_", title)


def raw_path(raw_dir, p): return os.path.join(raw_dir, p["league"], safe(p["title"]) + ".wikitext")


def refresh(client, state, pages, raw_dir, offline):
    """Bring the raw cache up to date. -> (changed titles, missing titles, revisions by title)."""
    st = state.setdefault("pages", {})
    titles = [p["title"] for p in pages]
    if offline:
        return [], [t for t in titles if t not in st], {t: st.get(t, {}) for t in titles}
    revs = client.revisions(titles)
    missing = [t for t in titles if revs[t]["missing"]]
    changed = [p["title"] for p in pages if not revs[p["title"]]["missing"]
               and (st.get(p["title"], {}).get("revid") != revs[p["title"]]["revid"] or not os.path.exists(raw_path(raw_dir, p)))]
    by = {p["title"]: p for p in pages}
    for t, r in client.contents(changed).items():
        if r["missing"] or r["text"] is None:
            missing.append(t); continue
        path = raw_path(raw_dir, by[t])
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f: f.write(r["text"])
        st[t] = dict(revid=r["revid"], timestamp=r["timestamp"], resolved=r["resolved"], league=by[t]["league"],
                     sha256=hashlib.sha256(r["text"].encode("utf-8")).hexdigest(), fetched_at=datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    for t in titles:
        if not revs[t]["missing"] and t in st and st[t]["revid"] == revs[t]["revid"]: st[t]["timestamp"] = revs[t]["timestamp"]
    return changed, sorted(set(missing)), revs


def parse_pages(league, y, pages, roster, raw_dir, state):
    claims, bad, nparsed = [], [], 0
    for p in pages:
        path = raw_path(raw_dir, p)
        if not os.path.exists(path): continue
        text = open(path, encoding="utf-8").read()
        rev = state["pages"].get(p["title"], {}).get("revid")
        try:
            if p["kind"] == "league":
                cs, b = P.parse_mlb_postseason(text, y, roster, p["title"])
                for c in cs: c["league_page"] = True
            else:
                cs, b = P.PARSERS[league](text, y, p["team"], roster, p["title"])
        except Exception as e:      # one page that cannot be read costs that page only; its club then shows in the club-count check
            bad.append((p["title"], "page could not be parsed: %s: %s" % (type(e).__name__, str(e)[:200])))
            continue
        for c in cs: c["revid"] = rev
        claims += cs; bad += [(p["title"], x) for x in b]; nparsed += 1
    return claims, bad, nparsed


# ---- second sources ----

def nflverse_subset(raw_dir, season):
    """The season's rows of the cached games.csv, verbatim, under the file's header line -> (bytes, sha256) or None."""
    path = os.path.join(raw_dir, "nflverse", "games.csv")
    if not os.path.exists(path): return None
    lines = open(path, encoding="utf-8", newline="").read().split("\n")
    head = next(csv.reader([lines[0]]))
    col = head.index("season")
    keep = [lines[0]] + [ln for ln in lines[1:] if ln.strip() and next(csv.reader([ln]))[col] == str(season)]
    data = ("\n".join(keep) + "\n").encode("utf-8")
    return data, hashlib.sha256(data).hexdigest()


def nflverse_claims(season, roster, state, raw_dir, offline):
    """games.csv from nflverse-data (CC BY 4.0) as claims. One conditional request: 304 when unchanged."""
    path = os.path.join(raw_dir, "nflverse", "games.csv")
    info = state.setdefault("nflverse", {})
    req = 0
    if not offline:
        h = {"User-Agent": UA}
        if info.get("etag") and os.path.exists(path): h["If-None-Match"] = info["etag"]

        def one_request():
            SRC.guard_url(NFLVERSE_URL)
            try:
                with urllib.request.urlopen(urllib.request.Request(NFLVERSE_URL, headers=h), timeout=120, context=W.CTX) as r:
                    data = r.read()
                    os.makedirs(os.path.dirname(path), exist_ok=True)
                    with open(path, "wb") as f: f.write(data)
                    info["etag"] = r.headers.get("ETag")
                    info["fetched_at"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            except urllib.error.HTTPError as e:
                if e.code != 304: raise
            return {"checked": True}
        _, cached = LM.default().fetch("nflverse", "games.csv", one_request, force=None if os.path.exists(path) else True)   # asked in the last minute (by any run): not again, unless this cache folder has no copy
        req = 0 if cached else 1
    if not os.path.exists(path): return [], [], req
    claims, bad = [], []
    ptype = {"REG": "regular", "WC": "playoffs", "DIV": "playoffs", "CON": "playoffs", "SB": "playoffs"}
    rnd = {"WC": "Wild Card", "DIV": "Divisional", "CON": "Conference", "SB": "Super Bowl"}
    for r in csv.DictReader(open(path, encoding="utf-8")):
        if r["season"] != str(season): continue
        a, h = roster.by_abbreviation(r["away_team"]), roster.by_abbreviation(r["home_team"])
        if not a or not h:
            bad.append(("nflverse", r["game_id"])); continue
        played = r["home_score"] not in ("", "NA") and r["away_score"] not in ("", "NA")
        claims.append(P.claim("nflverse", (a["name"], h["name"]), {a["name"]: int(r["away_score"]), h["name"]: int(r["home_score"])} if played else None,
                              h["name"], datetime.date.fromisoformat(r["gameday"]), "final" if played else "scheduled", ptype.get(r["game_type"], "regular"),
                              rnd.get(r["game_type"]), neutral=(r["location"] == "Neutral"), ot=(r["overtime"] == "1") if played else None,
                              src=r["game_id"]))
        claims[-1]["source"] = "nflverse"
        start = P.eastern_clock(r["gameday"], r.get("gametime"))   # Eastern HH:MM. Blank and NA are not a time.
        if start: claims[-1]["start"] = start
    sub = nflverse_subset(raw_dir, season)
    for c in claims: c["revid"] = sub[1] if sub else None
    return claims, bad, req


# ---- reporting ----

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="compare only, write nothing (the default)")
    ap.add_argument("--apply", action="store_true", help="stage 2: rehearse on DS1 (rolled back), then write to DS1 (never production)")
    ap.add_argument("--rehearse", action="store_true", help="like --apply but stop after the rehearsal")
    ap.add_argument("--log-dir", default=os.path.join(CACHE, "logs"), help="where --apply keeps its output")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--league", default=",".join(LEAGUES))
    ap.add_argument("--season", action="append", default=[], help="league=startYear, e.g. mlb=2026 (default: the season each league is in today)")
    ap.add_argument("--state", default=os.path.join(CACHE, "state.json"))
    ap.add_argument("--raw-dir", default=os.path.join(CACHE, "raw"))
    ap.add_argument("--no-balldontlie", action="store_true", help="do not read balldontlie (NBA, MLB, NFL) this run")
    ap.add_argument("--offline", action="store_true", help="parse the cached pages only; no request at all")
    ap.add_argument("--force-fetch", action="store_true", help="ignore the minute-old answers of the shared cache (every request still waits its turn in the limiter's queue); also SPX_FORCE_FETCH=1")
    ap.add_argument("--live", action="store_true", help="also publish the provisional results to the live score layer in Turso (live.py; also DAILY_LIVE=1); never DS1 or production")
    ap.add_argument("--live-only", action="store_true", help="an admin's refresh: fetch, build the games and publish the live rows, then stop (read-only on DS1; implies --live; not with --apply)")
    ap.add_argument("--day", help="with --live-only: only the games of this day (YYYY-MM-DD) of --league, and only the clubs playing that day are fetched")
    ap.add_argument("--game", type=int, help="with --live-only: one core game id; only its two clubs are fetched")
    ap.add_argument("--sources", help="with --live-only: the score sources to read, from %s (default: all)" % ",".join(LIVE_SOURCES))
    ap.add_argument("--live-request", type=int, help="the admin request id: its progress and result are written to Turso's live_request")
    ap.add_argument("--by", default="", help="who pressed the button (with --live-request)")
    ap.add_argument("--scope", default="", help="the request's scope (with --live-request): game, day, league, main5 or all")
    ap.add_argument("--no-ds1", action="store_true", help="skip the DS1 comparison (rosters then come from the cache)")
    ap.add_argument("--since", help="report DS1 games on or after this date that Wikipedia lacks (default: 7 days ago)")
    ap.add_argument("--json", help="write the games to this file")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args()
    if a.self_test:
        import selftest; return selftest.run()
    if a.live_only:
        if a.apply or a.rehearse: sys.exit("--live-only never writes DS1: drop --apply / --rehearse")
        a.live = True
    elif a.day or a.game or a.sources or a.live_request: sys.exit("--day, --game, --sources and --live-request go with --live-only")
    if a.live_request: return request_run(a)
    if not a.apply: return run(a, {})
    # --apply leaves a heartbeat row on DS1 (ingest.daily_run): 'running' now, 'ok' or 'failed' at the end
    import heartbeat, runlog_hook
    hb = heartbeat.start()
    rl = runlog_hook.start()
    result = {"runlog": runlog_hook.status()}      # 'off': no run entry and no admin alert (runlog_hook.py); the heartbeat row shows it
    try:
        rc = run(a, result)
    except BaseException as e:
        heartbeat.finish(hb, "failed", dict(result, error=("%s: %s" % (type(e).__name__, e))[:500]))
        runlog_hook.report(rl, result, 1, ("%s: %s" % (type(e).__name__, e))[:500])
        raise
    heartbeat.finish(hb, "ok" if rc == 0 else "failed", dict(result, exit_code=rc))
    runlog_hook.report(rl, result, rc)
    return rc


def request_run(a):
    """--live-only for an admin's request: the progress row in Turso is 'running' now and holds the outcome per game at the end. The last line printed,
    `live request: <status>: <summary>`, is what the release runner copies onto the request row and into the run log."""
    import live
    try: t = live.Turso()
    except Exception as e:
        t = None; print("live request: no progress row (%s)" % str(e)[:100])
    req = dict(id=a.live_request, by=a.by or "admin", scope=a.scope or "league", league=a.league if a.day else None, day=a.day, game=a.game,
               sources=[x for x in (a.sources or "").split(",") if x])
    if t: live.request_start(t, req)
    result = {}
    try:
        rc = run(a, result)
    except BaseException as e:
        msg = ("%s: %s" % (type(e).__name__, e))[:300]
        if t: live.request_finish(t, a.live_request, "failed", msg)
        print("live request: failed: " + msg)
        raise
    lv = result.get("live") or {}
    if lv.get("published") is False: status, text = "failed", "Nothing was published: %s" % lv.get("reason", "the live layer was not written")
    elif not lv.get("items"): status, text = "nothing", result.get("nothing") or "No game of this request could be matched with a result."
    else:
        c = collections.Counter(o for _, o, _ in lv["items"])
        text = "%d game(s) asked: %s." % (len(lv["items"]), ", ".join("%d %s" % (c[k], k) for k in live.OUTCOMES if c[k]))
        status = "done"
    if t: live.request_finish(t, a.live_request, status, text, lv.get("items"))
    print("live request: %s: %s" % (status, text))
    return rc


def write_leagues(a, built, league_errors, seasons, plans, report, all_games, league_claims, rosters, state, result, A=None):
    """Stage 2 for each league on its own: its rehearsal, its checks, its commit. A league that fails (or cannot be read, or lacks pages) never
    stops another; a game that cannot be staged is left out alone and counted. `result["league_results"]` is the per-league outcome the heartbeat
    keeps: outcome ok | warning (something was left out) | skipped | failed, a reason, the games and clubs left out, and the rows written.
    -> the exit code: 1 when any league failed (the next run tries that league again), else 0."""
    if A is None:
        import apply as A
    results = result["league_results"] = {}
    for lg, err in league_errors.items():
        results[lg] = dict(outcome="failed", reason="could not read its sources: " + err, games_skipped=0, clubs_skipped=[])
    result["leagues"] = []
    rc = 1 if league_errors else 0
    tables, changed = {}, 0
    for lg in built:
        r = report[lg]
        lr = results[lg] = dict(outcome="failed", reason=None, games_skipped=0, clubs_skipped=[])
        if r["missing"]:
            lr.update(outcome="skipped", reason="pages missing: " + ", ".join(r["missing"][:3]))
            print("\n%s NOT applied: %s" % (lg.upper(), lr["reason"])); continue
        try:
            todo = [dict(p, path=raw_path(a.raw_dir, p), claims=[c for c in league_claims[lg] if c["page"] == p["title"]]) for p in plans[lg]]
            staged, observations, unstaged = [], [], []
            for g in all_games[lg]:
                try:       # one game that cannot be staged is left out alone
                    row, obs = A.staging_row(g), A.observation(g, rosters[lg])
                except Exception as e:
                    unstaged.append(dict(game=g.get("source_key"), reason="%s: %s" % (type(e).__name__, str(e)[:200]))); continue
                staged.append(row); observations.append(obs)
            nfl = None
            if lg == "nfl":
                sub = nflverse_subset(a.raw_dir, seasons["nfl"])
                info = state.get("nflverse", {})
                if sub:
                    fetched = info.get("fetched_at") or datetime.datetime.fromtimestamp(os.path.getmtime(os.path.join(a.raw_dir, "nflverse", "games.csv")), datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                    nfl = dict(data=sub[0], sha256=sub[1], season=seasons["nfl"], day=fetched[:10], fetched_at=fetched,
                               claims=[c for c in league_claims["nfl"] if c["source"] == "nflverse"])
            files = []
            bdl = [c for c in league_claims.get(lg, []) if c["source"] == B.SOURCE]
            if lg in ("nba", "mlb", "nfl") and bdl:
                sub = B.subset(a.raw_dir, seasons[lg]) if lg == "nba" else S.subset(a.raw_dir, lg, seasons[lg])
                fetched = state.get(B.SOURCE if lg == "nba" else S.state_key(lg), {}).get("fetched_at") or datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                if sub: files.append(dict(source=B.SOURCE, league=lg, season=seasons[lg], title=B.TITLE if lg == "nba" else S.title(lg), ext="json", data=sub[0], sha256=sub[1],
                                          day=fetched[:10], fetched_at=fetched, claims=bdl, **({} if lg == "nba" else {"stem": S.stem(lg, seasons[lg])})))
            res = {}
            code = A.apply(todo, state["pages"], a.raw_dir, staged, observations, [(lg, seasons[lg])], nfl, a.log_dir,
                           rehearse_only=a.rehearse and not a.apply, result=res, files=files, league=lg)
        except Exception as e:
            code, res, unstaged = 1, dict(reason="%s: %s" % (type(e).__name__, str(e)[:300])), []
        lr["games_skipped"] = len(unstaged) + res.get("games_skipped", 0)
        lr["clubs_skipped"] = res.get("clubs_skipped", [])
        if unstaged: lr["games_unreadable"] = unstaged[:20]
        if code != 0:
            lr.update(outcome="failed", reason=res.get("reason") or "the league's load stopped (exit %d)" % code)
            rc = 1
            print("\n%s FAILED, the other leagues go on: %s" % (lg.upper(), lr["reason"])); continue
        result["leagues"].append(lg)
        lr.update(outcome="warning" if lr["games_skipped"] or lr["clubs_skipped"] else "ok", committed=bool(res.get("committed")), pages_new=res.get("pages_new"))
        if lr["outcome"] == "warning":
            lr["reason"] = "left out: %d club(s)%s, %d game(s)" % (len(lr["clubs_skipped"]), " (" + ", ".join(lr["clubs_skipped"]) + ")" if lr["clubs_skipped"] else "", lr["games_skipped"])
        load = res.get("load") or {}
        if res.get("committed"):
            lr["games_changed"] = load.get("games_changed", 0)
            if load.get("retired"): lr["games_retired"] = load["retired"]
            changed += load.get("games_changed", 0) or 0
            for t, n in (load.get("tables") or {}).items():
                m = tables.setdefault(t, dict(ins=0, upd=0, del_=0))
                m["ins"] += n.get("ins", 0); m["upd"] += n.get("upd", 0); m["del_"] += n.get("del", 0)
    result["skipped"] = ["%s (%s)" % (lg.upper(), x["reason"]) for lg, x in results.items() if x["outcome"] == "skipped"]
    result["games_skipped"] = sum(x["games_skipped"] for x in results.values())
    result["committed"] = any(x.get("committed") for x in results.values())
    result["load"] = dict(games_changed=changed, tables={t: dict(ins=m["ins"], upd=m["upd"], **{"del": m["del_"]}) for t, m in tables.items()})
    return rc


def run(a, result):
    """The whole run for the parsed arguments. `result` collects what the heartbeat records."""
    writing = a.apply or a.rehearse
    if writing and a.no_ds1: sys.exit("--apply / --rehearse write to DS1: drop --no-ds1")
    today = datetime.date.today()
    leagues = [x for x in a.league.split(",") if x]
    unknown = [x for x in leagues if x not in LEAGUES]
    if unknown or not leagues: sys.exit("--league takes some of %s (got %r)" % (",".join(LEAGUES), a.league))
    use = set(LIVE_SOURCES)
    if a.sources:
        use = {x for x in a.sources.split(",") if x}
        if not use or use - set(LIVE_SOURCES): sys.exit("--sources takes some of %s (got %r)" % (",".join(LIVE_SOURCES), a.sources))
        for x in sorted(use):
            try: SRC.require(x, None, "manual")
            except SRC.SourceRefused as e: sys.exit(str(e))
    scope, asked = None, None
    if a.day or a.game:
        if bool(a.day) == bool(a.game): sys.exit("give --day (with --league) or --game, not both")
        import live
        try: scope = live.locate(a.game, a.day, leagues)
        except (RuntimeError, ValueError) as e: sys.exit("could not find the games: %s" % e)
        if not scope:
            result.update(nothing="DS1 holds no game for this request.", live=dict(published=True, games=0, items=[]))
            print("DS1 holds no game for this request; nothing to refresh"); return 0
        leagues = [lg for lg in leagues if lg in scope]
        asked = sorted(i for x in scope.values() for i in x["ids"])
    a.bdl_leagues = [] if a.no_balldontlie or "balldontlie" not in use else ["nba", "mlb", "nfl"]
    seasons = {lg: season_now(lg, today) for lg in leagues}
    for s in a.season:
        lg, y = s.split("="); seasons[lg] = int(y)
    if scope:
        for lg, x in scope.items(): seasons[lg] = x["season"]
    since = datetime.date.fromisoformat(a.since) if a.since else today - datetime.timedelta(days=7)
    if scope: since = min(datetime.date.fromisoformat(x["date"]) for x in scope.values())
    state = W.load_state(a.state)
    rosters, rsrc = T.load_rosters(leagues, os.path.join(os.path.dirname(a.state), "rosters.json"))
    print("run %s | clubs from %s | state %s" % (datetime.datetime.now().strftime("%Y-%m-%d %H:%M"), rsrc, a.state))
    LM.USE_DS1[0] = writing
    if a.force_fetch: os.environ["SPX_FORCE_FETCH"] = "1"
    client = W.Client(force=True if a.force_fetch else None)
    all_games, report, extra_req, league_claims, bdl_req = {}, {}, 0, {}, {}
    plans = {lg: plan(lg, seasons[lg], rosters[lg]) for lg in leagues}
    if scope:        # only the clubs playing: their season articles and (MLB) the postseason page
        for lg in leagues:
            playing = {c["name"] for c in rosters[lg].clubs if c["fid"] in scope[lg]["fids"]}
            plans[lg] = [p for p in plans[lg] if p["kind"] == "league" or p["team"] in playing]
    if "wikipedia" not in use: plans = {lg: [] for lg in leagues}
    every = [p for lg in leagues for p in plans[lg]]
    changed_all, missing_all, _ = refresh(client, state, every, a.raw_dir, a.offline)     # one revisions pass for all leagues
    W.save_state(a.state, state)
    league_errors = {}
    for lg in leagues:
      try:       # one league that cannot be built (its sources, its parser) stops that league only
        y, roster, pages = seasons[lg], rosters[lg], plans[lg]
        titles = {p["title"] for p in pages}
        changed, missing = [t for t in changed_all if t in titles], [t for t in missing_all if t in titles]
        claims, bad, nparsed = parse_pages(lg, y, pages, roster, a.raw_dir, state)
        second = []
        if lg == "nfl" and "nflverse" in use:
            c2, b2, n = nflverse_claims(y, roster, state, a.raw_dir, a.offline); claims += c2; bad += b2; extra_req += n; second.append("nflverse (%d claims)" % len(c2))
        if lg in ("nba", "mlb", "nfl") and lg in a.bdl_leagues:      # balldontlie, free tier: NBA (balldontlie.py), MLB and NFL (bdlsports.py)
            try:
                c2, b2, n = B.claims(y, roster, since, a.offline, a.raw_dir, state) if lg == "nba" else S.claims(lg, y, roster, since, a.offline, a.raw_dir, state)
            except RuntimeError as e:
                c2, b2, n = [], [], 0; second.append("balldontlie FAILED, not used this run: %s" % e)
            if c2 is None: second.append("balldontlie skipped (no key: Mac keychain item '%s' or BALLDONTLIE_API_KEY)" % B.KEYCHAIN_ITEM)
            else: claims += c2; bad += b2; extra_req += n; bdl_req[lg] = n; second.append("balldontlie (%d claims, %d requests)" % (len(c2), n))
        gs = G.build_games(claims, lg, y)
        decided = list(G.LAST_DROPPED)
        league_claims[lg] = claims
        all_games[lg] = gs
        pre = sum(1 for c in claims if c["phase"] == "preseason")
        stamps = sorted(state["pages"][t].get("timestamp", "") for t in titles if t in state["pages"])
        report[lg] = dict(season=y, pages=len(pages), changed=len(changed), missing=missing, parsed=nparsed, claims=len(claims), preseason=pre,
                          bad=bad, games=len(gs), decided=decided, second=second, newest_rev=stamps[-1] if stamps else None, oldest_rev=stamps[0] if stamps else None)
      except Exception as e:
        league_errors[lg] = "%s: %s" % (type(e).__name__, str(e)[:300])
        print("%s FAILED while reading its sources; the other leagues go on: %s" % (lg.upper(), league_errors[lg]))
    W.save_state(a.state, state)
    built = [lg for lg in leagues if lg not in league_errors]
    confirm_rows = []
    if CR.enabled() and not a.offline and not a.live_only:
        rows = []
        if "nhl" in all_games:
            rows, summary = CR.confirm(all_games["nhl"])
            if summary:
                print("\n== Confirm-only check of NHL results (nothing stored but the outcome) ==\n%s" % ", ".join("%s %s" % (k.replace("_", " "), v) for k, v in summary.items()))
                result.update(red_confirm=summary)
        site_rows, site_summary = CS.confirm(all_games)
        if site_summary:
            print("\n== Confirm-only check of Yahoo Sports and USA TODAY (nothing stored but the outcome) ==")
            for src, summ in site_summary.items(): print("%-13s %s" % (src, ", ".join("%s %s" % (k.replace("_", " "), v) for k, v in summ.items())))
            result.update(confirm_sites=site_summary)
        rows += site_rows
        confirm_rows = rows
        if rows:
            comb = CS.combine(rows)
            early = sum(1 for c in comb.values() if c["early"])
            print("confirm-only sources agree on %d of %d games asked about (two or more agree, none disagrees)" % (early, len(comb)))
            result.update(confirm_early=early, confirm_asked=len(comb))
            if writing: CR.save(rows, CACHE)
    if (a.live or os.environ.get("DAILY_LIVE") == "1") and not a.offline:
        import live
        print("\n== Live score layer (Turso only) ==")
        kw = dict(since=since, until=max(datetime.date.fromisoformat(x["date"]) for x in scope.values()), only_ids=set(asked), asked=asked) if scope else {}
        result.update(live=live.publish(all_games, rosters, seasons, confirm_rows, state, "daily" if a.apply else "manual", **kw))
        if a.live_only:
            print("Requests this run: Wikipedia API %d | other %d (balldontlie %s)" % (client.requests, extra_req, ", ".join("%s %d" % (k.upper(), n) for k, n in bdl_req.items()) or "none"))
            result.update(wikipedia_requests=client.requests, other_requests=extra_req)
            return 0
    print("\n== Wikipedia pages ==")
    for lg in built:
        r = report[lg]
        print("%-4s season %-8s pages %3d  changed/downloaded %3d  parsed %3d  missing %s  rows unreadable %d  revisions %s .. %s" % (
            lg.upper(), season_label(lg, r["season"]), r["pages"], r["changed"], r["parsed"], r["missing"] or "none", len(r["bad"]),
            (r["oldest_rev"] or "-")[:16], (r["newest_rev"] or "-")[:16]))
        if r["second"]: print("     second sources: " + "; ".join(r["second"]))
    print("\n== Games found (preseason excluded) ==")
    for lg in built:
        gs = all_games[lg]
        c = collections.Counter(g["status"] for g in gs); k = collections.Counter(g["confidence"] for g in gs if g["status"] == "final")
        ph = collections.Counter(g["phase"] for g in gs)
        print("%-4s %5d games (regular %d, playoffs %d) | final %d (confirmed %d, single-source %d, resolved by a third source %d, disputed %d) | scheduled %d | postponed %d | cancelled %d | suspended %d" % (
            lg.upper(), len(gs), ph["regular"], ph["playoffs"], c["final"], k["confirmed"], k["single"], k["resolved"], k["disputed"], c["scheduled"], c["postponed"], c["cancelled"], c["suspended"]))
        for g in gs:
            if g["confidence"] in ("disputed", "resolved") or (a.verbose and g["notes"]):
                print("     %s %s: %s" % (g["date"], " v ".join(g["teams"]), "; ".join(g["alternatives"] + g["notes"])))
        if report[lg]["decided"]:
            print("     %d unplayed game(s) of decided series left out (the series is won): %s" % (len(report[lg]["decided"]),
                  "; ".join("%s %s v %s (%s)" % (d.isoformat(), aw, hm, st) for _, d, hm, aw, st in report[lg]["decided"][:12])))
        if a.verbose:
            for t, b in report[lg]["bad"][:15]: print("     unreadable [%s]: %s" % (t, b))
    if not a.no_ds1 and not writing:
        import compare
        print("\n== Dry run against DS1 (read-only) ==")
        compare.report(all_games, rosters, seasons, since, a.verbose, {lg: len(r['bad']) for lg, r in report.items()})
    if a.json:
        with open(a.json, "w", encoding="utf-8") as f:
            json.dump({lg: [dict({k: v for k, v in g.items() if k != "claims"}, date=g["date"].isoformat(), score=None if g["score"] is None else g["score"],
                                 provenance=["%s@%s" % (c["page"], c.get("revid")) for c in g["claims"]]) for g in gs] for lg, gs in all_games.items()},
                      f, indent=1, ensure_ascii=False, default=str)
    rc = 0
    if writing:
        rc = write_leagues(a, built, league_errors, seasons, plans, report, all_games, league_claims, rosters, state, result)
        print("\n== Leagues ==")
        for lg, x in result["league_results"].items():
            print("%-4s %-8s %s" % (lg.upper(), x["outcome"], x.get("reason") or ""))
        if result.get("committed"):
            import release_hook
            load = result.get("load") or {}
            result["release"] = release_hook.prepare_release(load.get("tables"), datetime.date.today().isoformat(), load)
    reqs = [x for x in client.log]
    print("\n== Requests this run ==")
    bdl_note = (" - balldontlie " + ", ".join("%s %d" % (lg.upper(), n) for lg, n in bdl_req.items())) if bdl_req else ""
    print("Wikipedia API: %d (%s) | other: %d (nflverse, balldontlie%s)" % (client.requests, ", ".join("%s x%d" % (k, sum(1 for w, n in reqs if w == k)) for k in ("revisions", "content")), extra_req, bdl_note))
    if not a.offline and LM._DEFAULT[0] is not None:
        st = LM._DEFAULT[0].stats
        print("Limiter: %d answer(s) reused from the last minute, %d fetched, %d s spent waiting in the queue" % (st["hits"], st["fetched"], round(st["waited"])))
        result.update(limiter=dict(reused=st["hits"], fetched=st["fetched"], waited_seconds=round(st["waited"])))
    result.update(wikipedia_requests=client.requests, other_requests=extra_req, balldontlie_requests=bdl_req)
    return rc


if __name__ == "__main__":
    sys.exit(main())
