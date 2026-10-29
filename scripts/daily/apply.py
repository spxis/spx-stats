#!/usr/bin/env python3
"""Stage 2: write what a run found to DS1. Only DS1: nothing here knows production.

Daily scores go to the database through ONE function, ingest.report_results (migration 044), called as the restricted role
ingest_writer (migration 046). History stays bulk. What `apply()` does, in this order, each step stopping the run if it fails:
  1. asks DS1 which page revisions it already holds (legacy_wikipedia_daily.page)
  2. REHEARSAL: one transaction that ends in ROLLBACK: migrations 043, 044, 046, 055 and 114, archive rows, raw load, db/build/152 (seasons and
     team seasons only), the report of every game as an observation (as ingest_writer), ingest.replay(true, true) for the games
     the report found no row for, the same report again (it must add nothing), the retire step (retire.sql: scheduled games of the daily source that no
     source lists any more are deleted; revive.sql, before the report, takes game_refs listed again off the retired list), and the checks (snapshot.sql + checks.sql).
     A failed check, or any error, means nothing was written.
  3. ARCHIVE: the raw wikitext of the new revisions into legacy_files.raw_archive (committed on its own, archive first)
  4. LOAD: one transaction, the same SQL as the rehearsal, COMMIT only if every check passed
  5. `select api.refresh();`
Idempotent: a page revision DS1 holds is neither archived nor loaded again, an observation already reported adds no row, and
the game state machine changes nothing it has already done, so a second run reports 0 new observations and 0 changed games.
"""
import datetime, hashlib, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path: sys.path.insert(0, HERE)
import games as G, sources as SRC, teams as T
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
DS1 = os.path.join(HERE, "ds1.sh")
MIGRATIONS = [os.path.join(REPO, "db", "migrations", f) for f in ("043_legacy_wikipedia_daily.sql", "044_ingest_report_results.sql", "046_ingest_writer_role.sql", "055_daily_balldontlie.sql", "114_game_starts_at.sql", "162_ingest_game_retired.sql")]
BUILD = os.path.join(REPO, "db", "build", "152_games_from_wikipedia_daily.sql")
SNAPSHOT = os.path.join(HERE, "snapshot.sql")
CHECKS = os.path.join(HERE, "checks.sql")
CLUBCHECK = os.path.join(HERE, "clubcheck.sql")
REVIVE = os.path.join(HERE, "revive.sql")
RETIRE = os.path.join(HERE, "retire.sql")
LEAGUECHECK = os.path.join(HERE, "leaguecheck.sql")


def lit(s):
    """A SQL text literal."""
    return "null" if s is None else "'" + str(s).replace("'", "''") + "'"


def jlit(obj):
    """A jsonb literal that cannot be broken out of: dollar-quoted with a tag the text does not contain."""
    text = json.dumps(obj, ensure_ascii=False, default=str)
    tag = "j"
    while "$" + tag + "$" in text: tag += "x"
    return "$%s$%s$%s$::jsonb" % (tag, text, tag)


def ds1_query(sql):
    p = subprocess.run([DS1, "-X", "-At", "-c", sql], capture_output=True, text=True)
    if p.returncode: raise RuntimeError("DS1: " + (p.stderr.strip().splitlines() or ["query failed"])[-1])
    return [ln for ln in p.stdout.splitlines() if ln]


def held_revisions():
    """{(source, title, revision)} DS1 already has. Empty when migration 043 has not been applied yet."""
    if not ds1_query("select to_regclass('legacy_wikipedia_daily.page')"): return set()
    return {tuple(r.split("|")) for r in ds1_query("select source, title, revision from legacy_wikipedia_daily.page")}


def strip_txn(path):
    """A build file or migration without its own begin/commit: the caller owns the transaction (as ds1-apply.sh does)."""
    out = [ln for ln in open(path, encoding="utf-8").read().split("\n") if not re.match(r"^\s*(begin|commit)\s*;\s*$", ln, re.I)]
    return "\n".join(out)


def claim_row(i, c):
    return dict(row_no=i, game_date=c["date"].isoformat(), teams=list(c["teams"]), home=c["home"],
                score=c["score"], status=c["status"], phase=c["phase"], round=c["round"], neutral=bool(c["neutral"]),
                overtime=c["ot"], shootout=c["so"], ot_periods=c["ot_n"], doubleheader=c["dh"],
                inconsistent=c.get("inconsistent"), src=c.get("src"))


def statements(g):
    """Every distinct score the sources gave, with who gave it ('A + B say X 3, Y 2')."""
    groups = {}
    for c in g["claims"]:
        if c["status"] == "final" and c["score"] is not None:
            groups.setdefault(frozenset(c["score"].items()), set()).add(re.sub(r"^wp:", "", c["source"]))
    return ["%s %s %s" % (" + ".join(sorted(v)), "says" if len(v) == 1 else "say", ", ".join("%s %d" % (t, s) for t, s in sorted(dict(k).items()))) for k, v in sorted(groups.items(), key=lambda kv: sorted(kv[1]))]


def staging_row(g):
    home_known = g["home"] is not None
    h = g["home"] or g["teams"][0]
    a = g["away"] if home_known else next(t for t in g["teams"] if t != h)
    sc = g["score"]
    ots = [c["ot"] for c in g["claims"] if c["status"] == "final" and c["ot"] is not None]
    return dict(source_key=g["source_key"], league=g["league"], season=g["season"], phase=g["phase"], round=g["round"],
                game_date=g["date"].isoformat(), home_name=h, away_name=a, home_known=home_known, neutral=bool(g["neutral"]),
                status=g["status"], home_score=sc[h] if sc else None, away_score=sc[a] if sc else None,
                overtime=(any(ots) if ots else None) if g["status"] == "final" else None,
                shootout=bool(g["so"]) if g["status"] == "final" and g["league"] == "nhl" else None, ot_periods=g["ot_n"], doubleheader=g["dh"],
                confidence=g["confidence"], dissent=statements(g) if g["confidence"] in ("resolved", "disputed") else [],
                notes=g["notes"], sources=g["sources"],
                provenance=["%s@%s" % (c["page"], c.get("revid")) for c in g["claims"]])


def _src(c):
    """The source an observation names: a ranked second source (nflverse, balldontlie) by name, any club page as wikipedia."""
    return c["source"] if c["source"] in G.SOURCE_RANK else "wikipedia"


def _ref(c):
    return "%s@%s" % (c["page"], c.get("revid"))


def observation(g, roster):
    """One cross-checked game -> the observation ingest.report_results takes (see migration 044): clubs as franchise keys, the
    verdict of the cross-check, and the evidence (references of the sources that agree, of those that conflict)."""
    r = staging_row(g)
    h, a = r["home_name"], r["away_name"]
    fk = lambda name: roster.by_name[T.norm(name)]["fkey"]
    claims = g["claims"]
    finals = [c for c in claims if c["status"] == "final" and c["score"] is not None]
    if g["status"] == "final" and finals:
        best = sorted(finals, key=lambda c: G._rank(c, g["home"]))[0]
        same = lambda c: c["score"] == best["score"]
        agree = [_ref(c) for c in finals if same(c)]
        conflict = [dict(ref=_ref(c), source=re.sub(r"^wp:", "", c["source"]), home_score=c["score"].get(h), away_score=c["score"].get(a)) for c in finals if not same(c)]
        src, ref = _src(best), _ref(best)
        verdict = r["confidence"]
    else:
        agree, conflict, verdict = [_ref(c) for c in claims], [], "none"
        src = _src(claims[0]) if claims and all(c["source"] in G.SOURCE_RANK for c in claims) else "wikipedia"
        ref = agree[0] if agree else None
    return dict(game_ref=r["source_key"], league=r["league"], season=r["season"], phase=r["phase"], round=r["round"], game_date=r["game_date"],
                game_no=int(r["source_key"].rsplit(":", 1)[1]), home_key=fk(h), away_key=fk(a), home_name=h, away_name=a,
                home_known=r["home_known"], neutral=r["neutral"], status=r["status"], home_score=r["home_score"], away_score=r["away_score"],
                overtime=r["overtime"], shootout=r["shootout"], ot_periods=r["ot_periods"], verdict=verdict, source=src, ref=ref,
                agree=agree, conflict=conflict, dissent=r["dissent"], notes=r["notes"], starts_at=g.get("start"))


def plan_load(todo, held, pages_state, raw_dir, nfl, files=()):
    """-> (archive rows, page rows, claim sets). `todo` is the pages (dicts from run.plan) of the leagues being applied."""
    archive, pages, claims = [], [], []
    for p in todo:
        st = pages_state.get(p["title"])
        path = p["path"]
        if not st or not os.path.exists(path): continue
        key = ("wikipedia", p["title"], str(st["revid"]))
        if key in held: continue
        data = open(path, "rb").read()
        sha = hashlib.sha256(data).hexdigest()
        day = st["fetched_at"][:10]
        name = "wikipedia/%s/%s/%s.r%s.wikitext" % (day, p["league"], re.sub(r"[^A-Za-z0-9._-]+", "_", p["title"]), st["revid"])
        archive.append(dict(name=name, saved_on=day, sha256=sha, path=path))
        pages.append(dict(source="wikipedia", league=p["league"], season=p["season"], kind=p["kind"], title=p["title"], club=p.get("team"),
                          revision=str(st["revid"]), revision_at=st.get("timestamp"), sha256=sha, bytes=len(data), archive_name=name, fetched_at=st["fetched_at"]))
        claims.append((p["title"], str(st["revid"]), "wikipedia", [c for c in p["claims"]]))
    if nfl:
        key = ("nflverse", "games.csv", nfl["sha256"])
        if key not in held:
            name = "nflverse/%s/games-%d.%s.csv" % (nfl["day"], nfl["season"], nfl["sha256"][:12])
            archive.append(dict(name=name, saved_on=nfl["day"], sha256=nfl["sha256"], data=nfl["data"]))
            pages.append(dict(source="nflverse", league="nfl", season=nfl["season"], kind="file", title="games.csv", club=None, revision=nfl["sha256"],
                              revision_at=None, sha256=nfl["sha256"], bytes=len(nfl["data"]), archive_name=name, fetched_at=nfl["fetched_at"]))
            claims.append(("games.csv", nfl["sha256"], "nflverse", nfl["claims"]))
    for f in files:      # another source's season file (balldontlie's games.json): kept as fetched, one page row per distinct content
        if (f["source"], f["title"], f["sha256"]) in held: continue
        SRC.assert_storable(f["source"])
        name = "%s/%s/%s.%s.%s" % (f["source"], f["day"], f.get("stem") or "games-%d" % f["season"], f["sha256"][:12], f["ext"])
        archive.append(dict(name=name, saved_on=f["day"], sha256=f["sha256"], data=f["data"]))
        pages.append(dict(source=f["source"], league=f["league"], season=f["season"], kind="file", title=f["title"], club=None, revision=f["sha256"],
                          revision_at=None, sha256=f["sha256"], bytes=len(f["data"]), archive_name=name, fetched_at=f["fetched_at"]))
        claims.append((f["title"], f["sha256"], f["source"], f["claims"]))
    return archive, pages, claims


def archive_sql(archive):
    out = []
    for a in archive:
        data = a["data"] if "data" in a else open(a["path"], "rb").read()
        out.append("insert into legacy_files.raw_archive (name, saved_on, sha256, data) values (%s, %s, %s, decode('%s', 'hex')) on conflict (name) do nothing;"
                   % (lit(a["name"]), lit(a["saved_on"]), lit(a["sha256"]), data.hex()))
    return "\n".join(out) + ("\n" if out else "")


def load_sql(pages, claims, staged, leagues_seasons):
    out = []
    for p in pages:
        out.append("insert into legacy_wikipedia_daily.page (source, league, season, kind, title, club, revision, revision_at, sha256, bytes, archive_name, fetched_at) values "
                   "(%s, %s, %d, %s, %s, %s, %s, %s, %s, %d, %s, %s) on conflict (source, title, revision) do nothing;" % (
                       lit(p["source"]), lit(p["league"]), p["season"], lit(p["kind"]), lit(p["title"]), lit(p["club"]), lit(p["revision"]),
                       lit(p["revision_at"]), lit(p["sha256"]), p["bytes"], lit(p["archive_name"]), lit(p["fetched_at"])))
    for title, rev, source, cs in claims:
        rows = [claim_row(i, c) for i, c in enumerate(cs)]
        if not rows: continue
        out.append("insert into legacy_wikipedia_daily.claim (page_id, row_no, game_date, teams, home, score, status, phase, round, neutral, overtime, shootout, ot_periods, doubleheader, inconsistent, src)\n"
                   "select p.page_id, x.row_no, x.game_date, array(select jsonb_array_elements_text(x.teams)), x.home, x.score, x.status, x.phase, x.round, x.neutral, x.overtime, x.shootout, x.ot_periods, x.doubleheader, x.inconsistent, x.src\n"
                   "from legacy_wikipedia_daily.page p, jsonb_to_recordset(%s) as x(row_no int, game_date date, teams jsonb, home text, score jsonb, status text, phase text, round text, neutral boolean, overtime boolean, shootout boolean, ot_periods int, doubleheader int, inconsistent text, src text)\n"
                   "where p.source = %s and p.title = %s and p.revision = %s on conflict (page_id, row_no) do nothing;" % (jlit(rows), lit(source), lit(title), lit(rev)))
    if leagues_seasons:
        out.append("delete from legacy_wikipedia_daily.game where (league, season) in (%s);" % ", ".join("(%s, %d)" % (lit(l), s) for l, s in leagues_seasons))
    if staged:
        out.append("insert into legacy_wikipedia_daily.game (source_key, league, season, phase, round, game_date, home_name, away_name, home_known, neutral, status, home_score, away_score, overtime, shootout, ot_periods, doubleheader, confidence, dissent, notes, sources, provenance)\n"
                   "select x.source_key, x.league, x.season, x.phase, x.round, x.game_date, x.home_name, x.away_name, x.home_known, x.neutral, x.status, x.home_score, x.away_score, x.overtime, x.shootout, x.ot_periods, x.doubleheader, x.confidence,\n"
                   "       array(select jsonb_array_elements_text(x.dissent)), array(select jsonb_array_elements_text(x.notes)), array(select jsonb_array_elements_text(x.sources)), array(select jsonb_array_elements_text(x.provenance))\n"
                   "from jsonb_to_recordset(%s) as x(source_key text, league text, season int, phase text, round text, game_date date, home_name text, away_name text, home_known boolean, neutral boolean, status text, home_score int, away_score int, overtime boolean, shootout boolean, ot_periods int, doubleheader int, confidence text, dissent jsonb, notes jsonb, sources jsonb, provenance jsonb);" % jlit(staged))
    return "\n".join(out) + ("\n" if out else "")


def run_script(script, label, log_path, show=True):
    """Run a psql script on DS1; stream and keep the output. -> (returncode, output)."""
    p = subprocess.Popen([DS1, "-X", "-q", "-f", script], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    lines = []
    for ln in p.stdout:
        lines.append(ln)
        if show: sys.stdout.write(ln)
    p.wait()
    out = "".join(lines)
    with open(log_path, "a", encoding="utf-8") as f: f.write("\n##### %s (exit %d)\n%s" % (label, p.returncode, out))
    return p.returncode, out


def report_sql(observations):
    """The call, as the restricted role: one statement, its answer kept in the psql variable :j."""
    return "set local role ingest_writer;\nselect ingest.report_results(%s) as j \\gset\nreset role;\n" % jlit(observations)


def main_script(workdir, with_archive, commit, league="", skip=()):
    """The one transaction: migrations, snapshot, [archive], raw load, 152, report, bulk step, report again, snapshot, checks, commit or rollback."""
    mig = []
    for i, m in enumerate(MIGRATIONS):
        path = os.path.join(workdir, "migration%d.sql" % i)
        open(path, "w").write(strip_txn(m)); mig.append(path)
    bld = os.path.join(workdir, "build.sql")
    open(bld, "w").write(strip_txn(BUILD))
    rep = os.path.join(workdir, "report.sql")
    s = ["\\set ON_ERROR_STOP on", "\\set commit " + ("true" if commit else "false"), "\\set league " + lit(league), "\\set clubcheck " + CLUBCHECK, "\\set leaguecheck " + LEAGUECHECK,
         "begin;", "set client_min_messages = warning;",
         "create temp table _skip (club text not null);"] + ["insert into _skip values (%s);" % lit(c) for c in skip] + [
         "create temp table _snap (snap text, what text, league text, k text, n bigint);",
         "create temp table _gh (snap text, game_id bigint, source_id smallint, game_date date, st text, h text);",
         "create temp table _checks (name text not null, ok boolean not null, detail text);"]
    s += ["\\i " + p for p in mig]
    if with_archive: s.append("\\i " + os.path.join(workdir, "archive.sql"))
    s += ["\\set snap before", "\\i " + SNAPSHOT, "\\i " + os.path.join(workdir, "load.sql"), "\\i " + bld,
          "create temp table _chg1 as select * from chg;",
          "create temp table _run as select (select count(*) from ingest.game_observation) as n;",
          "\\echo", "\\echo '== Games the sources list again after they were retired: taken off ingest.game_retired =='", "\\i " + REVIVE,
          "\\echo", "\\echo '== Reporting the games: ingest.report_results as ingest_writer =='",
          "\\i " + rep, "create temp table _res as select :'j'::jsonb as j;",
          "\\echo '== The bulk step for the games the report found no row for: ingest.replay(true, true) =='",
          "select ingest.replay(true, true) as j \\gset", "create temp table _rep as select :'j'::jsonb as j;",
          "\\echo '== The same report again, in the same transaction: it must change nothing =='",
          "\\i " + bld,
          "insert into _checks select 'a second pass of db/build/152 changes nothing', coalesce(sum(n), 0) = 0, coalesce(sum(n), 0) || ' rows changed' from chg;",
          "\\i " + rep, "create temp table _res2 as select :'j'::jsonb as j;",
          "select ingest.replay(true, true) as j \\gset", "create temp table _rep2 as select :'j'::jsonb as j;",
          "\\echo", "\\echo '== Retiring scheduled games of the daily source that no source lists any more =='", "\\i " + RETIRE,
          "\\set snap after", "\\i " + SNAPSHOT, "\\i " + CHECKS,
          "\\echo",
          "select case when ok then 'ok  ' else 'FAIL' end as result, name, detail from _checks where not ok or name like 'a second pass%' order by ok, name;",
          "select count(*) = 0 as all_ok from _checks where not ok \\gset",
          # one machine-readable line for run.py (heartbeat and release hook): what the report did and which release tables this
          # transaction wrote to (pg_stat_xact counts the rows inserted, updated and deleted so far in THIS transaction)
          "\\pset tuples_only on", "\\pset format unaligned",
          "select 'DAILY_SUMMARY ' || jsonb_build_object("
          "'observations', (select (j ->> 'observations')::int from _res), 'new', (select (j ->> 'new')::int from _res), "
          "'repeat', (select (j ->> 'repeat')::int from _res), 'games_changed', (select jsonb_array_length(j -> 'changed') from _res), "
          "'retired', (select count(*) from _retired), "
          "'games_made', (select (j ->> 'games_made')::int from _rep), 'games_changed_by_replay', (select (j ->> 'games_changed')::int from _rep), "
          "'tables', coalesce((select jsonb_object_agg(schemaname || '.' || relname, jsonb_build_object('ins', n_tup_ins, 'upd', n_tup_upd, 'del', n_tup_del)) "
          "from pg_stat_xact_all_tables where schemaname in ('core', 'meta', 'ref') and n_tup_ins + n_tup_upd + n_tup_del > 0), '{}'::jsonb))::text;",
          "select 'DAILY_FAIL ' || name || ' | ' || coalesce(detail, '') from _checks where not ok;",
          "\\pset format aligned", "\\pset tuples_only off",
          "\\if :all_ok", "  \\if :commit", "    commit;", "    \\echo RESULT: committed", "  \\else", "    rollback;", "    \\echo RESULT: rolled back (rehearsal), every check passed", "  \\endif",
          "\\else", "  rollback;", "  \\echo RESULT: rolled back, a check failed", "\\endif"]
    path = os.path.join(workdir, "main.sql")
    open(path, "w").write("\n".join(s) + "\n")
    return path


def daily_summary(out):
    """The DAILY_SUMMARY line main_script prints -> dict, or None."""
    for ln in out.splitlines():
        if ln.startswith("DAILY_SUMMARY "):
            try: return json.loads(ln[len("DAILY_SUMMARY "):])
            except ValueError: return None
    return None


def lines_of(out, tag):
    """The JSON payloads of the `tag {json}` lines of a script's output."""
    got = []
    for ln in out.splitlines():
        if ln.startswith(tag + " "):
            try: got.append(json.loads(ln[len(tag) + 1:]))
            except ValueError: pass
    return got


def failed_checks(out):
    """['check name | detail', ...] from the DAILY_FAIL lines."""
    return [ln[len("DAILY_FAIL "):] for ln in out.splitlines() if ln.startswith("DAILY_FAIL ")]


def without_clubs(staged, observations, clubs):
    """Staged games and observations without any game a skipped club plays in. -> (staged, observations, dropped source keys)"""
    clubs = set(clubs)
    if not clubs: return staged, observations, []
    keep = lambda r: r["home_name"] not in clubs and r["away_name"] not in clubs
    dropped = [r["source_key"] for r in staged if not keep(r)]
    return [r for r in staged if keep(r)], [o for o in observations if keep(o)], dropped


def record_issues(league, season, issues, day):
    """One meta.data_issue row per club left out of a committed league load, once; the open rows of this league and season for clubs no
    longer left out are closed. Best effort: a failure here never changes the load's outcome."""
    try:
        sid = "(select source_id from meta.source where code = 'wikipedia_daily')"
        sql = ["begin;"]
        for s in issues:
            sql.append("insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution) select %s, %s, %s, %s, %s "
                       "where not exists (select 1 from meta.data_issue i where i.source_id = %s and i.entity_kind = %s and i.entity_key = %s and i.issue = %s and i.resolved_at is null);"
                       % (sid, lit(s["kind"]), lit(s["key"]), lit(s["issue"]), lit("left out of the daily load on %s; the rest of the league was saved" % day),
                          sid, lit(s["kind"]), lit(s["key"]), lit(s["issue"])))
        keys = "{" + ",".join('"%s"' % s["key"].replace("\\", "\\\\").replace('"', '\\"') for s in issues) + "}"
        sql.append("update meta.data_issue set resolved_at = now() where source_id = %s and resolved_at is null and issue like 'daily: left out%%' and entity_key like %s and entity_key <> all (%s::text[]);"
                   % (sid, lit("%s:%s:%%" % (league, season)), lit(keys)))
        sql.append("commit;")
        rc, out = run_script_text("\n".join(sql), "issues", os.path.join(tempfile.gettempdir(), "spx-daily-issues.log"))
        return rc == 0
    except Exception as e:
        print("data issues could not be recorded (%s)" % e)
        return False


def apply(todo_pages, pages_state, raw_dir, staged_games, observations, leagues_seasons, nfl, log_dir, rehearse_only=False, result=None, files=(), league=""):
    """todo_pages: [dict(league, season, kind, title, team, path, claims)]; staged_games: staging rows; observations: what
    ingest.report_results takes; nfl: dict or None. `result`, if given, is filled in for the caller (heartbeat, release hook):
    pages_new, archive_rows, committed, the DAILY_SUMMARY of the committed load, and what was left out.
    One league per call (`league`; run.py calls it once for each): its rehearsal, its checks and its commit are its own.
    A club the club-count check cannot explain is left out of that league's load (its games are not staged or reported) and the rehearsal runs
    again without it; a check that still fails blocks the league and nothing is written for it."""
    if result is None: result = {}
    os.makedirs(log_dir, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    log = os.path.join(log_dir, "%s-apply%s.log" % (stamp, "-" + league if league else ""))
    held = held_revisions()
    archive, pages, claims = plan_load(todo_pages, held, pages_state, raw_dir, nfl, files)
    print("\nDS1 holds %d page revisions; new to load: %d (%d claim rows); staged games: %d; observations to report: %d" % (
        len(held), len(pages), sum(len(c[3]) for c in claims), len(staged_games), len(observations)))
    result.update(pages_new=len(pages), archive_rows=len(archive), committed=False, clubs_skipped=[], games_skipped=0)
    skip, dropped = [], []
    with tempfile.TemporaryDirectory(prefix="spx-daily-") as wd:
        open(os.path.join(wd, "archive.sql"), "w").write(archive_sql(archive))
        for attempt in (0, 1):
            st, ob, dropped = without_clubs(staged_games, observations, skip)
            open(os.path.join(wd, "load.sql"), "w").write(load_sql(pages, claims, st, leagues_seasons))
            open(os.path.join(wd, "report.sql"), "w").write(report_sql(ob))
            print("\n===== REHEARSAL%s (one transaction, ends in ROLLBACK; log %s) =====" % (" " + league.upper() if league else "", log))
            rc, out = run_script(main_script(wd, True, False, league, skip), "rehearsal", log)
            if rc or "RESULT: rolled back (rehearsal)" not in out:
                result["failed_checks"] = failed_checks(out)
                result["reason"] = ("a check failed: " + "; ".join(result["failed_checks"])[:400]) if result["failed_checks"] else "the rehearsal stopped with an error (exit %d)" % rc
                print("\nREHEARSAL FAILED: nothing was written to DS1 for this league. Stopping it."); return 1
            odd = [c for c in lines_of(out, "DAILY_CLUB") if c["club"] not in skip]
            if odd and attempt == 0:
                skip = sorted({c["club"] for c in odd})
                result["club_details"] = odd
                print("\n%d club(s) cannot be explained by their articles: %s. Their games are left out; rehearsing again without them." % (len(skip), ", ".join(skip)))
                continue
            break
        result["clubs_skipped"] = skip
        result["games_skipped"] = len(dropped)
        if rehearse_only:
            print("\nrehearsal clean; --rehearse: nothing written."); return 0
        if archive:
            print("\n===== ARCHIVE: %d raw files into legacy_files.raw_archive (committed first) =====" % len(archive))
            # the archive goes in on its own, before the load, with the migration's table in place
            ap = os.path.join(wd, "archive_run.sql")
            open(ap, "w").write("\\set ON_ERROR_STOP on\nbegin;\n" + strip_txn(MIGRATIONS[0]) + "\n\\i " + os.path.join(wd, "archive.sql") + "\nselect count(*) as archived_this_run, pg_size_pretty(sum(length(data))) as size from legacy_files.raw_archive where name in (" + ", ".join(lit(a["name"]) for a in archive) + ");\ncommit;\n")
            rc, out = run_script(ap, "archive", log)
            if rc:
                result["reason"] = "the archive step failed (exit %d)" % rc
                print("\nARCHIVE FAILED; nothing loaded."); return 1
        print("\n===== LOAD (one transaction; commits only if every check passes) =====")
        rc, out = run_script(main_script(wd, False, True, league, skip), "load", log)
        if rc or "RESULT: committed" not in out:
            result["failed_checks"] = failed_checks(out)
            result["reason"] = ("a check failed: " + "; ".join(result["failed_checks"])[:400]) if result["failed_checks"] else "the load stopped with an error (exit %d)" % rc
            print("\nLOAD DID NOT COMMIT: nothing was written by it."); return 1
        result.update(committed=True, load=daily_summary(out))
    if leagues_seasons:
        season = leagues_seasons[0][1]
        issues = [dict(kind="club", key="%s:%s:%s" % (league, season, c), issue="daily: left out, its article's games do not match the database") for c in skip]
        result["issues_recorded"] = record_issues(league, season, issues, datetime.date.today().isoformat())
    print("\n===== api.refresh() =====")
    rc, out = run_script_text("select api.refresh();", "refresh", log)
    print("api.refresh(): " + ("done" if rc == 0 else "FAILED (exit %d): %s" % (rc, out.strip()[-300:])))
    result["refresh"] = "done" if rc == 0 else "failed"
    print("\nlog: " + log)
    return rc


def run_script_text(sql, label, log_path):
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False) as f:
        f.write(sql + "\n"); path = f.name
    try: return run_script(path, label, log_path, show=False)
    finally: os.unlink(path)
