#!/usr/bin/env python3
"""Stage 2: write what a run found to DS1. Only DS1: nothing here knows production.

Daily scores go to the database through ONE function, ingest.report_results (migration 044), called as the restricted role
ingest_writer (migration 045). History stays bulk. What `apply()` does, in this order, each step stopping the run if it fails:
  1. asks DS1 which page revisions it already holds (legacy_wikipedia_daily.page)
  2. REHEARSAL: one transaction that ends in ROLLBACK: migrations 043-045, archive rows, raw load, db/build/152 (seasons and
     team seasons only), the report of every game as an observation (as ingest_writer), ingest.replay(true, true) for the games
     the report found no row for, the same report again (it must add nothing), and the checks (snapshot.sql + checks.sql).
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
import games as G, teams as T
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
DS1 = os.path.join(HERE, "ds1.sh")
MIGRATIONS = [os.path.join(REPO, "db", "migrations", f) for f in ("043_legacy_wikipedia_daily.sql", "044_ingest_report_results.sql", "045_ingest_writer_role.sql")]
BUILD = os.path.join(REPO, "db", "build", "152_games_from_wikipedia_daily.sql")
SNAPSHOT = os.path.join(HERE, "snapshot.sql")
CHECKS = os.path.join(HERE, "checks.sql")


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
        src, ref = ("nflverse" if best["source"] in G.SOURCE_RANK else "wikipedia"), _ref(best)
        verdict = r["confidence"]
    else:
        agree, conflict, verdict = [_ref(c) for c in claims], [], "none"
        src = "nflverse" if claims and all(c["source"] in G.SOURCE_RANK for c in claims) else "wikipedia"
        ref = agree[0] if agree else None
    return dict(game_ref=r["source_key"], league=r["league"], season=r["season"], phase=r["phase"], round=r["round"], game_date=r["game_date"],
                game_no=int(r["source_key"].rsplit(":", 1)[1]), home_key=fk(h), away_key=fk(a), home_name=h, away_name=a,
                home_known=r["home_known"], neutral=r["neutral"], status=r["status"], home_score=r["home_score"], away_score=r["away_score"],
                overtime=r["overtime"], shootout=r["shootout"], ot_periods=r["ot_periods"], verdict=verdict, source=src, ref=ref,
                agree=agree, conflict=conflict, dissent=r["dissent"], notes=r["notes"])


def plan_load(todo, held, pages_state, raw_dir, nfl):
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


def main_script(workdir, with_archive, commit):
    """The one transaction: migrations, snapshot, [archive], raw load, 152, report, bulk step, report again, snapshot, checks, commit or rollback."""
    mig = []
    for i, m in enumerate(MIGRATIONS):
        path = os.path.join(workdir, "migration%d.sql" % i)
        open(path, "w").write(strip_txn(m)); mig.append(path)
    bld = os.path.join(workdir, "build.sql")
    open(bld, "w").write(strip_txn(BUILD))
    rep = os.path.join(workdir, "report.sql")
    s = ["\\set ON_ERROR_STOP on", "\\set commit " + ("true" if commit else "false"), "begin;", "set client_min_messages = warning;",
         "create temp table _snap (snap text, what text, league text, k text, n bigint);",
         "create temp table _gh (snap text, game_id bigint, source_id smallint, game_date date, st text, h text);",
         "create temp table _checks (name text not null, ok boolean not null, detail text);"]
    s += ["\\i " + p for p in mig]
    if with_archive: s.append("\\i " + os.path.join(workdir, "archive.sql"))
    s += ["\\set snap before", "\\i " + SNAPSHOT, "\\i " + os.path.join(workdir, "load.sql"), "\\i " + bld,
          "create temp table _chg1 as select * from chg;",
          "create temp table _run as select (select count(*) from ingest.game_observation) as n;",
          "\\echo", "\\echo '== Reporting the games: ingest.report_results as ingest_writer =='",
          "\\i " + rep, "create temp table _res as select :'j'::jsonb as j;",
          "\\echo '== The bulk step for the games the report found no row for: ingest.replay(true, true) =='",
          "select ingest.replay(true, true) as j \\gset", "create temp table _rep as select :'j'::jsonb as j;",
          "\\echo '== The same report again, in the same transaction: it must change nothing =='",
          "\\i " + bld,
          "insert into _checks select 'a second pass of db/build/152 changes nothing', coalesce(sum(n), 0) = 0, coalesce(sum(n), 0) || ' rows changed' from chg;",
          "\\i " + rep, "create temp table _res2 as select :'j'::jsonb as j;",
          "select ingest.replay(true, true) as j \\gset", "create temp table _rep2 as select :'j'::jsonb as j;",
          "\\set snap after", "\\i " + SNAPSHOT, "\\i " + CHECKS,
          "\\echo",
          "select case when ok then 'ok  ' else 'FAIL' end as result, name, detail from _checks where not ok or name like 'a second pass%' order by ok, name;",
          "select count(*) = 0 as all_ok from _checks where not ok \\gset",
          "\\if :all_ok", "  \\if :commit", "    commit;", "    \\echo RESULT: committed", "  \\else", "    rollback;", "    \\echo RESULT: rolled back (rehearsal), every check passed", "  \\endif",
          "\\else", "  rollback;", "  \\echo RESULT: rolled back, a check failed", "\\endif"]
    path = os.path.join(workdir, "main.sql")
    open(path, "w").write("\n".join(s) + "\n")
    return path


def apply(todo_pages, pages_state, raw_dir, staged_games, observations, leagues_seasons, nfl, log_dir, rehearse_only=False):
    """todo_pages: [dict(league, season, kind, title, team, path, claims)]; staged_games: staging rows; observations: what
    ingest.report_results takes; nfl: dict or None."""
    os.makedirs(log_dir, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    log = os.path.join(log_dir, "%s-apply.log" % stamp)
    held = held_revisions()
    archive, pages, claims = plan_load(todo_pages, held, pages_state, raw_dir, nfl)
    print("\nDS1 holds %d page revisions; new to load: %d (%d claim rows); staged games: %d; observations to report: %d" % (
        len(held), len(pages), sum(len(c[3]) for c in claims), len(staged_games), len(observations)))
    with tempfile.TemporaryDirectory(prefix="spx-daily-") as wd:
        open(os.path.join(wd, "archive.sql"), "w").write(archive_sql(archive))
        open(os.path.join(wd, "load.sql"), "w").write(load_sql(pages, claims, staged_games, leagues_seasons))
        open(os.path.join(wd, "report.sql"), "w").write(report_sql(observations))
        print("\n===== REHEARSAL (one transaction, ends in ROLLBACK; log %s) =====" % log)
        rc, out = run_script(main_script(wd, True, False), "rehearsal", log)
        if rc or "RESULT: rolled back (rehearsal)" not in out:
            print("\nREHEARSAL FAILED: nothing was written to DS1. Stopping."); return 1
        if rehearse_only:
            print("\nrehearsal clean; --rehearse: nothing written."); return 0
        if archive:
            print("\n===== ARCHIVE: %d raw files into legacy_files.raw_archive (committed first) =====" % len(archive))
            # the archive goes in on its own, before the load, with the migration's table in place
            ap = os.path.join(wd, "archive_run.sql")
            open(ap, "w").write("\\set ON_ERROR_STOP on\nbegin;\n" + strip_txn(MIGRATIONS[0]) + "\n\\i " + os.path.join(wd, "archive.sql") + "\nselect count(*) as archived_this_run, pg_size_pretty(sum(length(data))) as size from legacy_files.raw_archive where name in (" + ", ".join(lit(a["name"]) for a in archive) + ");\ncommit;\n")
            rc, out = run_script(ap, "archive", log)
            if rc: print("\nARCHIVE FAILED; nothing loaded."); return 1
        print("\n===== LOAD (one transaction; commits only if every check passes) =====")
        rc, out = run_script(main_script(wd, False, True), "load", log)
        if rc or "RESULT: committed" not in out:
            print("\nLOAD DID NOT COMMIT: nothing was written by it."); return 1
    print("\n===== api.refresh() =====")
    rc, out = run_script_text("select api.refresh();", "refresh", log)
    print("api.refresh(): " + ("done" if rc == 0 else "FAILED (exit %d): %s" % (rc, out.strip()[-300:])))
    print("\nlog: " + log)
    return rc


def run_script_text(sql, label, log_path):
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False) as f:
        f.write(sql + "\n"); path = f.name
    try: return run_script(path, label, log_path, show=False)
    finally: os.unlink(path)
