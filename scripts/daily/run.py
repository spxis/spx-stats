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

Forbidden sources (never fetched, even to test): NHL API, MLB statsapi, NBA.com / cdn.nba.com, NFL.com, cfl.ca, Yahoo,
ESPN, Sports Reference, newspapers and TV sites.
"""
import argparse, collections, csv, datetime, hashlib, io, json, os, re, sys, time, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import balldontlie as B, bdlsports as S, games as G, parsers as P, teams as T, wikiapi as W

CACHE = os.path.expanduser(os.environ.get("SPX_DAILY_CACHE", "~/Library/Caches/spx-stats-daily"))
LEAGUES = ["nhl", "nba", "mlb", "nfl", "cfl"]
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
        if p["kind"] == "league":
            cs, b = P.parse_mlb_postseason(text, y, roster, p["title"])
            for c in cs: c["league_page"] = True
        else:
            cs, b = P.PARSERS[league](text, y, p["team"], roster, p["title"])
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
        try:
            req = 1
            with urllib.request.urlopen(urllib.request.Request(NFLVERSE_URL, headers=h), timeout=120, context=W.CTX) as r:
                data = r.read()
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "wb") as f: f.write(data)
                info["etag"] = r.headers.get("ETag")
                info["fetched_at"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        except urllib.error.HTTPError as e:
            if e.code != 304: raise
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
    ap.add_argument("--no-ds1", action="store_true", help="skip the DS1 comparison (rosters then come from the cache)")
    ap.add_argument("--since", help="report DS1 games on or after this date that Wikipedia lacks (default: 7 days ago)")
    ap.add_argument("--json", help="write the games to this file")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args()
    if a.self_test:
        import selftest; return selftest.run()
    if not a.apply: return run(a, {})
    # --apply leaves a heartbeat row on DS1 (ingest.daily_run): 'running' now, 'ok' or 'failed' at the end
    import heartbeat
    hb = heartbeat.start()
    result = {}
    try:
        rc = run(a, result)
    except BaseException as e:
        heartbeat.finish(hb, "failed", dict(result, error=("%s: %s" % (type(e).__name__, e))[:500]))
        raise
    heartbeat.finish(hb, "ok" if rc == 0 else "failed", dict(result, exit_code=rc))
    return rc


def run(a, result):
    """The whole run for the parsed arguments. `result` collects what the heartbeat records."""
    writing = a.apply or a.rehearse
    if writing and a.no_ds1: sys.exit("--apply / --rehearse write to DS1: drop --no-ds1")
    today = datetime.date.today()
    leagues = [x for x in a.league.split(",") if x]
    a.bdl_leagues = [] if a.no_balldontlie else ["nba", "mlb", "nfl"]
    seasons = {lg: season_now(lg, today) for lg in leagues}
    for s in a.season:
        lg, y = s.split("="); seasons[lg] = int(y)
    since = datetime.date.fromisoformat(a.since) if a.since else today - datetime.timedelta(days=7)
    state = W.load_state(a.state)
    rosters, rsrc = T.load_rosters(leagues, os.path.join(os.path.dirname(a.state), "rosters.json"))
    print("run %s | clubs from %s | state %s" % (datetime.datetime.now().strftime("%Y-%m-%d %H:%M"), rsrc, a.state))
    client = W.Client()
    all_games, report, extra_req, league_claims, bdl_req = {}, {}, 0, {}, {}
    plans = {lg: plan(lg, seasons[lg], rosters[lg]) for lg in leagues}
    every = [p for lg in leagues for p in plans[lg]]
    changed_all, missing_all, _ = refresh(client, state, every, a.raw_dir, a.offline)     # one revisions pass for all leagues
    W.save_state(a.state, state)
    for lg in leagues:
        y, roster, pages = seasons[lg], rosters[lg], plans[lg]
        titles = {p["title"] for p in pages}
        changed, missing = [t for t in changed_all if t in titles], [t for t in missing_all if t in titles]
        claims, bad, nparsed = parse_pages(lg, y, pages, roster, a.raw_dir, state)
        second = []
        if lg == "nfl":
            c2, b2, n = nflverse_claims(y, roster, state, a.raw_dir, a.offline); claims += c2; bad += b2; extra_req += n; second.append("nflverse (%d claims)" % len(c2))
        if lg in ("nba", "mlb", "nfl") and lg in a.bdl_leagues:      # balldontlie, free tier: NBA (balldontlie.py), MLB and NFL (bdlsports.py)
            try:
                c2, b2, n = B.claims(y, roster, since, a.offline, a.raw_dir, state) if lg == "nba" else S.claims(lg, y, roster, since, a.offline, a.raw_dir, state)
            except RuntimeError as e:
                c2, b2, n = [], [], 0; second.append("balldontlie FAILED, not used this run: %s" % e)
            if c2 is None: second.append("balldontlie skipped (no key: Mac keychain item '%s' or BALLDONTLIE_API_KEY)" % B.KEYCHAIN_ITEM)
            else: claims += c2; bad += b2; extra_req += n; bdl_req[lg] = n; second.append("balldontlie (%d claims, %d requests)" % (len(c2), n))
        gs = G.build_games(claims, lg, y)
        league_claims[lg] = claims
        all_games[lg] = gs
        pre = sum(1 for c in claims if c["phase"] == "preseason")
        stamps = sorted(state["pages"][t].get("timestamp", "") for t in titles if t in state["pages"])
        report[lg] = dict(season=y, pages=len(pages), changed=len(changed), missing=missing, parsed=nparsed, claims=len(claims), preseason=pre,
                          bad=bad, games=len(gs), second=second, newest_rev=stamps[-1] if stamps else None, oldest_rev=stamps[0] if stamps else None)
    W.save_state(a.state, state)
    print("\n== Wikipedia pages ==")
    for lg in leagues:
        r = report[lg]
        print("%-4s season %-8s pages %3d  changed/downloaded %3d  parsed %3d  missing %s  rows unreadable %d  revisions %s .. %s" % (
            lg.upper(), season_label(lg, r["season"]), r["pages"], r["changed"], r["parsed"], r["missing"] or "none", len(r["bad"]),
            (r["oldest_rev"] or "-")[:16], (r["newest_rev"] or "-")[:16]))
        if r["second"]: print("     second sources: " + "; ".join(r["second"]))
    print("\n== Games found (preseason excluded) ==")
    for lg in leagues:
        gs = all_games[lg]
        c = collections.Counter(g["status"] for g in gs); k = collections.Counter(g["confidence"] for g in gs if g["status"] == "final")
        ph = collections.Counter(g["phase"] for g in gs)
        print("%-4s %5d games (regular %d, playoffs %d) | final %d (confirmed %d, single-source %d, resolved by a third source %d, disputed %d) | scheduled %d | postponed %d | cancelled %d | suspended %d" % (
            lg.upper(), len(gs), ph["regular"], ph["playoffs"], c["final"], k["confirmed"], k["single"], k["resolved"], k["disputed"], c["scheduled"], c["postponed"], c["cancelled"], c["suspended"]))
        for g in gs:
            if g["confidence"] in ("disputed", "resolved") or (a.verbose and g["notes"]):
                print("     %s %s: %s" % (g["date"], " v ".join(g["teams"]), "; ".join(g["alternatives"] + g["notes"])))
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
        import apply as A
        todo, staged, observations, lseasons, skipped = [], [], [], [], []
        for lg in leagues:
            r = report[lg]
            if r["missing"]:
                skipped.append("%s (pages missing: %s)" % (lg.upper(), ", ".join(r["missing"][:3]))); continue
            for p in plans[lg]:
                todo.append(dict(p, path=raw_path(a.raw_dir, p), claims=[c for c in league_claims[lg] if c["page"] == p["title"]]))
            staged += [A.staging_row(g) for g in all_games[lg]]
            observations += [A.observation(g, rosters[lg]) for g in all_games[lg]]
            lseasons.append((lg, seasons[lg]))
        nfl = None
        if "nfl" in [lg for lg, _ in lseasons]:
            sub = nflverse_subset(a.raw_dir, seasons["nfl"])
            info = state.get("nflverse", {})
            if sub:
                fetched = info.get("fetched_at") or datetime.datetime.fromtimestamp(os.path.getmtime(os.path.join(a.raw_dir, "nflverse", "games.csv")), datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                nfl = dict(data=sub[0], sha256=sub[1], season=seasons["nfl"], day=fetched[:10], fetched_at=fetched,
                           claims=[c for c in league_claims["nfl"] if c["source"] == "nflverse"])
        files = []
        for lg in ("nba", "mlb", "nfl"):
            bdl = [c for c in league_claims.get(lg, []) if c["source"] == B.SOURCE]
            if lg not in [x for x, _ in lseasons] or not bdl: continue
            sub = B.subset(a.raw_dir, seasons[lg]) if lg == "nba" else S.subset(a.raw_dir, lg, seasons[lg])
            fetched = state.get(B.SOURCE if lg == "nba" else S.state_key(lg), {}).get("fetched_at") or datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            if sub: files.append(dict(source=B.SOURCE, league=lg, season=seasons[lg], title=B.TITLE if lg == "nba" else S.title(lg), ext="json", data=sub[0], sha256=sub[1],
                                      day=fetched[:10], fetched_at=fetched, claims=bdl, **({} if lg == "nba" else {"stem": S.stem(lg, seasons[lg])})))
        if skipped: print("\nNOT applied: " + "; ".join(skipped))
        result.update(leagues=[lg for lg, _ in lseasons], skipped=skipped)
        rc = A.apply(todo, state["pages"], a.raw_dir, staged, observations, lseasons, nfl, a.log_dir, rehearse_only=a.rehearse and not a.apply, result=result, files=files)
        if rc == 0 and result.get("committed"):
            import release_hook
            load = result.get("load") or {}
            result["release"] = release_hook.prepare_release(load.get("tables"), datetime.date.today().isoformat(), load)
    reqs = [x for x in client.log]
    print("\n== Requests this run ==")
    bdl_note = (" - balldontlie " + ", ".join("%s %d" % (lg.upper(), n) for lg, n in bdl_req.items())) if bdl_req else ""
    print("Wikipedia API: %d (%s) | other: %d (nflverse, balldontlie%s)" % (client.requests, ", ".join("%s x%d" % (k, sum(1 for w, n in reqs if w == k)) for k in ("revisions", "content")), extra_req, bdl_note))
    result.update(wikipedia_requests=client.requests, other_requests=extra_req, balldontlie_requests=bdl_req)
    return rc


if __name__ == "__main__":
    sys.exit(main())
