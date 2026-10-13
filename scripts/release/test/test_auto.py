#!/usr/bin/env python3
"""Tests of the automatic approval of daily_scores releases and the switch that pauses it (migration 047), on the same
local setup as test_release.py (scratch databases for DS1 and production, mock_api.py for the Management API).

    python3 -I scripts/release/test/test_auto.py [--source spx_stats] [--only auto_basic,auto_hold]

Time is simulated by moving a release's created_at back (the hold is measured from it, on production's clock).
Exit code: 0 all passed, 1 a check failed.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import test_release as T  # noqa: E402
from test_release import DS1, PROD, SECRET, approve, compare_same, fresh, number_of, ok, psql, rid, status  # noqa: E402

AUTO = "auto:daily-scores"


def sched(n, offset=0):
    """Make n final games look unfinished in production, so DS1's final scores are what a daily release brings."""
    ids = psql(PROD, "select string_agg(game_id::text, ',' order by game_id) from (select game_id from core.game where status = 'final' "
                     "and home_score is not null order by game_id offset %d limit %d) q" % (offset, n))
    psql(PROD, "update core.game set status = 'scheduled', home_score = null, away_score = null where game_id in (%s)" % ids)
    return ids.split(",")


def backdate(num, minutes=11):
    for db in (DS1, PROD):
        psql(db, "update meta.data_release set created_at = now() - interval '%d minutes' where number = '%s'" % (minutes, num))


def call(sql, secret=None):
    r = psql(PROD, "select %s" % sql.replace("SECRET", secret or SECRET), check=False, role="anon")
    return r.returncode == 0, r.stderr.strip()


def hold(num, actor="tester@example.com", secret=None):
    return call("api.hold_release('SECRET', %d, '%s')" % (rid(num), actor), secret)


def flag():
    return psql(PROD, "select paused || '|' || coalesce(paused_by, '') || '|' || coalesce(reason, '') from meta.auto_approval")


def pause(reason="testing", actor="tester@example.com", secret=None):
    return call("api.pause_auto_approvals('SECRET', '%s', '%s')" % (actor, reason), secret)


def resume(actor="tester@example.com", secret=None):
    return call("api.resume_auto_approvals('SECRET', '%s')" % actor, secret)


def auto_of(num):
    return json.loads(psql(DS1, "select (preview -> 'auto')::text from meta.data_release where number = '%s'" % num))


def prep_daily(env, *extra, by="daily-job"):
    rc, out, err = env.rel("--by", by, "prepare", "--kind", "daily_scores", *extra)
    return number_of(out), out + err


def game_fp(db):
    return psql(db, "select md5(string_agg(t::text, ',' order by game_id)) from core.game t")


def venue_fp(db):
    return psql(db, "select md5(string_agg(t::text, ',' order by venue_id)) from core.venue t")


def reset_flag():
    for db in (DS1, PROD):
        psql(db, "update meta.auto_approval set paused = false, paused_at = null, paused_by = null, reason = null")


def auto_basic(env):
    fresh()
    ids = sched(5)
    n, text = prep_daily(env)
    ok("a daily_scores release is prepared", n is not None, text)
    ok("its kind is daily_scores and the default tables are used",
       psql(PROD, "select kind || ' ' || array_to_string(tables, ',') from meta.data_release where number = '%s'" % n)
       == "daily_scores core.game,meta.data_issue,meta.verification")
    a = auto_of(n)
    ok("it is eligible, with 5 games and the hold recorded", a["eligible"] is True and a["games"] == 5 and a["hold_minutes"] == 10 and a["reasons"] == [], a)
    ok("the title defaults to Daily scores <date>", psql(PROD, "select title from meta.data_release where number = '%s'" % n).startswith("Daily scores 20"))
    rc, out, err = env.rel("run")
    ok("it is not approved before the hold has passed", status(n) == "pending", out + err)
    backdate(n, 9)
    rc, out, err = env.rel("run")
    ok("nor after 9 minutes", status(n) == "pending", out + err)
    pre = game_fp(PROD)
    backdate(n, 11)
    rc, out, err = env.rel("run")
    ok("after the hold it is approved by the runner and applied", status(n) == "done" and status(n, DS1) == "done", out + err + status(n))
    ok("approved by auto:daily-scores on both sides",
       psql(PROD, "select approved_by from meta.data_release where number = '%s'" % n) == AUTO
       and psql(DS1, "select approved_by from meta.data_release where number = '%s'" % n) == AUTO)
    ok("approved at least 10 minutes after it was prepared",
       psql(PROD, "select (approved_at - created_at) >= interval '10 minutes' from meta.data_release where number = '%s'" % n) == "t")
    ok("production equals DS1 for the three tables", compare_same("core.game,meta.verification,meta.data_issue")[0] and game_fp(PROD) == game_fp(DS1) != pre)
    res = json.loads(psql(DS1, "select result::text from meta.data_release where number = '%s'" % n))
    ok("the result lists the touched rows", sorted(res["touched"]["core.game"]) == sorted(json.dumps([i]) for i in ids), res.get("touched"))
    ok("the switch stays off", flag().startswith("false"))
    ok("the footer view counts a daily_scores release", psql(PROD, "select number from api.data_version", role="anon") == n)
    rc, out, err = env.rel("rollback", "--release", n)
    ok("a daily_scores release can be rolled back (and needs John)", number_of(out) and status(number_of(out)) == "pending", out + err)


def auto_ineligible(env):
    def case(name, setup, expect):
        fresh()
        setup()
        n, text = prep_daily(env)
        a = auto_of(n) if n else {}
        ok("not eligible: " + name, n and a.get("eligible") is False and any(expect in r for r in a.get("reasons", [])), a.get("reasons") or text)
        ok("pending, and production holds the reasons too: " + name,
           status(n) == "pending" and expect in psql(PROD, "select (preview -> 'auto' ->> 'reasons') from meta.data_release where number = '%s'" % n))
        backdate(n)
        rc, out, err = env.rel("run")
        ok("not approved after the hold either: " + name, status(n) == "pending", out + err)
        return n

    case("a new game",
         lambda: (sched(3), psql(DS1, "insert into core.game (season_id, phase, game_date, home_team_season_id, away_team_season_id, status, source_id, source_key) "
                                      "select season_id, phase, game_date, home_team_season_id, away_team_season_id, 'scheduled', source_id, 'auto-test' from core.game limit 1")),
         "new games would be inserted")
    case("a final game with a different score",
         lambda: psql(DS1, "update core.game set home_score = home_score + 7 where game_id = (select min(game_id) from core.game where status = 'final' and home_score is not null)"),
         "already final in production")
    case("more than 500 games", lambda: sched(600), "limit is 500")
    case("a failing check",
         lambda: (sched(3), psql(DS1, "insert into core.standing (team_season_id, phase, as_of, source_id, is_final) select team_season_id, phase, as_of + 1, source_id, true from core.standing where is_final limit 1")),
         "blocked: check 020_duplicate_keys")

    def other():
        ids = sched(3)
        psql(DS1, "update core.game set broadcaster = 'Somebody' where game_id = %s" % ids[0])
    n = case("another column", other, "column broadcaster")
    ok("John can still approve it by hand", approve(n)[0])
    env.rel("run")
    ok("and it runs as a manual approval", status(n) == "done" and psql(PROD, "select approved_by from meta.data_release where number = '%s'" % n) == "tester@example.com")
    case("verification for another game",
         lambda: (sched(3), psql(DS1, "insert into meta.verification (entity_kind, entity_id, status, source_id) select 'game', max(game_id), 'confirmed', 1 from core.game")),
         "meta.verification: 1 new rows are not about the games")
    case("a data issue row that differs",
         lambda: (sched(3), psql(DS1, "insert into meta.data_issue (data_issue_id, entity_kind, entity_key, issue, resolution) overriding system value values (9001, 'game', 'k', 'i', 'x')"),
                  psql(PROD, "insert into meta.data_issue (data_issue_id, entity_kind, entity_key, issue) overriding system value values (9001, 'game', 'k', 'i')")),
         "meta.data_issue: 1 rows would change")

    fresh()
    rc, out, err = env.rel("prepare", "--kind", "daily_scores", "--replace")
    ok("--replace is refused", rc != 0 and "not allowed" in err, out + err)
    psql(DS1, "update core.venue set city = city || ' (q)' where venue_id = (select min(venue_id) from core.venue)")
    n, text = prep_daily(env, "--tables", "core.venue")
    ok("a table outside the policy is not eligible", n and "tables outside the policy: core.venue" in " ".join(auto_of(n)["reasons"]), text)
    rc, out, err = env.rel("prepare", "--title", "Plain publish", "--tables", "core.venue")
    p = number_of(out)
    backdate(p)
    env.rel("run")
    ok("a plain publish is never approved by the runner", status(p) == "pending")
    dash = json.loads(psql(PROD, "select api.release_dashboard('%s')::text" % SECRET, role="anon"))
    ok("the dashboard shows the reasons and the switch",
       any(r["preview"]["auto"]["reasons"] for r in dash["pending"] if r["kind"] == "daily_scores") and dash["auto"]["paused"] is False)


def auto_hold(env):
    fresh()
    sched(4)
    n, text = prep_daily(env)
    good, err_ = hold(n, secret="wrong" * 10)
    ok("hold needs the secret", not good and "not allowed" in err_, err_)
    ok("hold refuses the runner's name", not hold(n, actor="auto:daily-scores")[0])
    good, err_ = hold(n)
    ok("hold works on an eligible release inside its hold", good, err_)
    ok("it is pending with held_by and held_at",
       psql(PROD, "select status || ' ' || held_by || ' ' || (held_at is not null) from meta.data_release where number = '%s'" % n) == "pending tester@example.com true")
    ok("holding twice is refused", not hold(n)[0])
    backdate(n)
    rc, out, err = env.rel("run")
    ok("a held release is not approved after the hold", status(n) == "pending", out + err)
    approve(n)
    env.rel("run")
    ok("John approves it by hand and it runs", status(n) == "done")

    # the runner approved it a moment ago but has not started it: hold takes it back
    fresh()
    sched(4)
    n, _ = prep_daily(env)
    psql(PROD, "update meta.data_release set status = 'approved', approved_by = '%s', approved_at = now() where number = '%s'" % (AUTO, n))
    good, err_ = hold(n)
    ok("an auto-approved release that has not started can be held",
       good and status(n) == "pending" and psql(PROD, "select approved_by is null from meta.data_release where number = '%s'" % n) == "t", err_)
    psql(PROD, "update meta.data_release set status = 'done' where number = '%s'" % n)
    ok("a finished release cannot be held", not hold(n)[0])
    psql(DS1, "update core.venue set city = city || ' (h)' where venue_id = (select min(venue_id) from core.venue)")
    rc, out, err = env.rel("prepare", "--title", "Plain publish", "--tables", "core.venue")
    p = number_of(out)
    ok("only daily_scores releases can be held", not hold(p)[0])
    ok("approve_release refuses the runner's name as actor",
       not call("api.approve_release('SECRET', %d, true, 'auto:daily-scores')" % rid(p))[0]
       and not call("api.approve_release('SECRET', %d, true, 'System')" % rid(p))[0] and status(p) == "pending")


def auto_pause(env):
    fresh()
    ok("the switch exists on both sides and is off", flag() == "false||" and psql(DS1, "select paused from meta.auto_approval") == "f")
    ok("anon cannot read the switch", psql(PROD, "select * from meta.auto_approval", check=False, role="anon").returncode != 0)
    ok("anon cannot write the switch", psql(PROD, "update meta.auto_approval set paused = true", check=False, role="anon").returncode != 0)
    ok("pause needs the secret", not pause(secret="wrong" * 10)[0] and flag().startswith("false"))
    ok("pause refuses an empty reason and the runner's names", not pause(reason="")[0] and not pause(actor="system")[0] and not pause(actor="auto:x")[0])
    ok("resume needs the secret", not resume(secret="wrong" * 10)[0])
    sched(4)
    n, _ = prep_daily(env)
    backdate(n)
    # the runner approved it, then someone paused: the pause wins at apply time
    psql(PROD, "update meta.data_release set status = 'approved', approved_by = '%s', approved_at = now() where number = '%s'" % (AUTO, n))
    pre = game_fp(PROD)
    ok("pause works", pause("Checking the feed")[0] and flag() == "true|tester@example.com|Checking the feed")
    ok("pausing twice keeps the first reason", pause("Second")[0] and flag().endswith("Checking the feed"))
    rc, out, err = env.rel("run")
    ok("an approved auto release does not run while paused; it goes back to pending", status(n) == "pending" and game_fp(PROD) == pre, out + err + status(n))
    ok("the switch is mirrored on DS1", psql(DS1, "select paused || '|' || paused_by from meta.auto_approval") == "true|tester@example.com")
    rc, out, err = env.rel("run")
    ok("and it is not approved again while paused, even after the hold", status(n) == "pending" and "paused" in out + err, out + err)
    approve(n)
    env.rel("run")
    ok("John's own approval still works while paused", status(n) == "done")
    ok("resume clears the switch", resume()[0] and flag().startswith("false|"))
    ok("resume when not paused is harmless", resume()[0])


def auto_resume(env):
    fresh()
    ids = sched(6)
    pause("hold for the test")
    a, _ = prep_daily(env)
    psql(DS1, "update core.game set home_score = home_score + 1 where game_id = %s" % ids[0])
    psql(PROD, "update core.game set status = 'scheduled' where game_id = %s" % ids[0])
    b, _ = prep_daily(env)
    backdate(a)
    backdate(b)
    rc, out, err = env.rel("run")
    ok("while paused both stay pending", status(a) == "pending" and status(b) == "pending", out + err)
    ok("resume", resume()[0])
    rc, out, err = env.rel("run")
    ok("after resume the oldest is re-checked and found stale, the next is approved and applied",
       status(a) == "pending" and status(b) == "done"
       and out.index("release %s is not auto-approved" % a) < out.index("release %s approved automatically" % b), out + err)
    ok("the stale one says why", "changed since the preview" in " ".join(auto_of(a)["reasons"]) and auto_of(a)["eligible"] is False, auto_of(a))
    ok("no pause came out of it", flag().startswith("false"))


def auto_failure(env):
    fresh()
    ids = sched(3)
    psql(PROD, "alter table core.game add constraint no_999 check (home_score is distinct from 999)")
    psql(DS1, "update core.game set home_score = 999 where game_id = %s" % ids[0])
    pre = game_fp(PROD)
    n, _ = prep_daily(env)
    ok("the release looks eligible", auto_of(n)["eligible"] is True, auto_of(n))
    backdate(n)
    rc, out, err = env.rel("run")
    ok("the apply fails and production is unchanged", status(n) == "failed" and status(n, DS1) == "failed" and game_fp(PROD) == pre, out + err)
    f = flag()
    ok("a failed automatic release pauses every auto approval, as system", f.startswith("true|system|") and n in f, f)
    ok("the pause is mirrored on DS1", psql(DS1, "select paused from meta.auto_approval") == "t")
    psql(PROD, "alter table core.game drop constraint no_999")
    n2, _ = prep_daily(env)
    backdate(n2)
    rc, out, err = env.rel("run")
    ok("while paused the next eligible release waits", status(n2) == "pending", out + err)
    resume()
    env.rel("run")
    ok("John resumes and it is approved and applied", status(n2) == "done")

    # a manual release failing does not pause
    fresh()
    psql(DS1, "insert into core.person (full_name, kind) values ('BAD NAME', 'player')")
    psql(PROD, "alter table core.person add constraint no_bad check (full_name <> 'BAD NAME')")
    rc, out, err = env.rel("prepare", "--title", "Fails", "--tables", "core.person")
    p = number_of(out)
    approve(p)
    env.rel("run")
    ok("a failing manual release does not pause automatic approvals", status(p) == "failed" and flag().startswith("false"))


def auto_apply_checks(env):
    # the policy is checked again at apply time
    fresh()
    ids = sched(4)
    n, _ = prep_daily(env)
    backdate(n)
    psql(PROD, "update meta.data_release set status = 'approved', approved_by = '%s', approved_at = now() where number = '%s'" % (AUTO, n))
    psql(PROD, "update core.game set status = 'final', home_score = 1, away_score = 0 where game_id = %s" % ids[0])
    pre = game_fp(PROD)
    rc, out, err = env.rel("run")
    ok("a game that became final after the approval sends the release back to pending, untouched",
       status(n) == "pending" and game_fp(PROD) == pre and auto_of(n)["eligible"] is False, out + err)
    ok("that is not a failure, so no pause", flag().startswith("false"))

    # only a daily_scores release can carry the automatic approval
    fresh()
    psql(DS1, "update core.venue set city = city || ' (f)' where venue_id = (select min(venue_id) from core.venue)")
    rc, out, err = env.rel("prepare", "--title", "Forged", "--tables", "core.venue")
    p = number_of(out)
    pre = venue_fp(PROD)
    psql(PROD, "update meta.data_release set status = 'approved', approved_by = '%s' where number = '%s'" % (AUTO, p))
    rc, out, err = env.rel("run")
    ok("a publish release carrying the automatic approval is refused and production is untouched",
       status(p) == "failed" and status(p, DS1) == "failed" and venue_fp(PROD) == pre, out + err)
    ok("and that pauses automatic approvals", flag().startswith("true|system|"), flag())

    fresh()
    sched(2)
    n, _ = prep_daily(env)
    psql(PROD, "update meta.data_release set status = 'approved', approved_by = 'auto:other' where number = '%s'" % n)
    rc, out, err = env.rel("run")
    ok("an unknown automatic name is refused", status(n) == "failed" and flag().startswith("true|system|"), out + err)

    fresh()
    sched(2)
    n, _ = prep_daily(env)
    psql(PROD, "update meta.data_release set status = 'approved', approved_by = '%s', digest = 'forged' where number = '%s'" % (AUTO, n))
    rc, out, err = env.rel("run")
    ok("an automatic approval on a tampered row is refused and pauses", status(n, DS1) == "failed" and flag().startswith("true|system|"), out + err)


def auto_drift(env):
    fresh()
    ids = sched(4)
    n, _ = prep_daily(env)
    backdate(n)
    env.rel("run")
    ok("the automatic release is done", status(n) == "done")
    rc, out, err = env.rel("drift")
    ok("drift after a clean release finds nothing and does not pause", rc == 0 and flag().startswith("false"), out + err)
    psql(DS1, "update core.game set home_score = home_score + 1 where game_id = %s" % ids[0])
    rc, out, err = env.rel("drift")
    ok("DS1 moving ahead of a touched row is not a mismatch", rc == 1 and flag().startswith("false"), out + err)
    psql(DS1, "update core.game set home_score = home_score - 1 where game_id = %s" % ids[0])
    psql(PROD, "update core.venue set city = city || ' (d)' where venue_id = (select min(venue_id) from core.venue)")
    rc, out, err = env.rel("drift")
    ok("a difference in other rows does not pause", rc == 1 and flag().startswith("false"), out + err)
    psql(PROD, "update core.game set home_score = home_score + 3 where game_id = %s" % ids[1])
    rc, out, err = env.rel("drift")
    f = flag()
    ok("production changed in a row an automatic release wrote: paused by system", f.startswith("true|system|Drift check") and n in f, f)
    ok("the pause is on the DS1 mirror too", psql(DS1, "select paused from meta.auto_approval") == "t")


def add_daily_source():
    for db in (DS1, PROD):
        psql(db, "insert into meta.source (source_id, code, name, kind) overriding system value "
                 "values (777, 'wikipedia_daily', 'Wikipedia (daily scores)', 'website')")


def issue_case(env, name, expect, change, kind="game", source=777, key=None, resolved=False):
    """One game changes; a data issue (about that game unless key is given) is on both sides and DS1 then changes it with `change`.
    expect None: the release is eligible. Otherwise a part of the reason that must be given."""
    fresh()
    add_daily_source()
    ids = sched(3)
    k = psql(DS1, "select source_key from core.game where game_id = %s" % ids[0])
    other = psql(DS1, "select source_key from core.game where game_id not in (%s) and source_key is not null limit 1" % ",".join(ids))
    row = ("(9001, %d, '%s', '%s', 'score disagrees', %s, '2026-10-01 12:00:00+00', %s)"
           % (source, kind, key or k, "'fixed'" if resolved else "null", "'2026-10-02 12:00:00+00'" if resolved else "null"))
    sql = ("insert into meta.data_issue (data_issue_id, source_id, entity_kind, entity_key, issue, resolution, found_at, resolved_at) "
           "overriding system value values " + row.replace("%KEY%", other))
    psql(PROD, sql)
    psql(DS1, sql)
    psql(DS1, "update meta.data_issue set %s where data_issue_id = 9001" % change.replace("OTHER", other))
    n, text = prep_daily(env)
    a = auto_of(n) if n else {}
    if expect is None:
        ok("eligible: " + name, n and a.get("eligible") is True and a.get("reasons") == [], a.get("reasons") or text)
    else:
        ok("not eligible: " + name, n and a.get("eligible") is False and any(expect in r for r in a.get("reasons", [])), a.get("reasons") or text)
    return n


def auto_issue_update(env):
    resolve = "resolution = 'fixed', resolved_at = '2026-10-12 08:00:00+00'"
    n = issue_case(env, "resolving a wikipedia_daily issue about a changed game", None, resolve)
    backdate(n)
    rc, out, err = env.rel("run")
    ok("it is approved and applied, and production holds the resolution",
       status(n) == "done" and psql(PROD, "select resolution || ' ' || (resolved_at is not null) from meta.data_issue where data_issue_id = 9001") == "fixed true"
       and psql(PROD, "select approved_by from meta.data_release where number = '%s'" % n) == AUTO, out + err)
    issue_case(env, "re-opening a resolved issue", None, "resolution = null, resolved_at = null", resolved=True)
    issue_case(env, "changing the resolution text of a resolved issue", None, "resolution = 'fixed again'", resolved=True)
    issue_case(env, "a change to the issue text", "column issue changes", resolve + ", issue = 'something else'")
    issue_case(env, "a different source", "the source is not wikipedia_daily", resolve, source=93)
    issue_case(env, "a game that is not in the release", "its game is not one of the games that change", resolve, key="%KEY%")
    issue_case(env, "an entity kind other than game", "it is not about a game", resolve, kind="season")
    issue_case(env, "a change to the entity key", "column entity_key changes", "entity_key = 'OTHER'")
    fresh()
    add_daily_source()
    ids = sched(3)
    k = psql(DS1, "select source_key from core.game where game_id = %s" % ids[0])
    sql = ("insert into meta.data_issue (data_issue_id, source_id, entity_kind, entity_key, issue, found_at) overriding system value "
           "values (9002, 777, 'game', '%s', 'x', '2026-10-01 12:00:00+00')" % k)
    psql(PROD, sql)
    n, _ = prep_daily(env)
    ok("a data issue only in production is a removal and not eligible",
       auto_of(n)["eligible"] is False and any("would be removed" in r for r in auto_of(n)["reasons"]), auto_of(n))
    # the policy is checked again right before the apply
    fresh()
    add_daily_source()
    ids = sched(3)
    k = psql(DS1, "select source_key from core.game where game_id = %s" % ids[0])
    sql = ("insert into meta.data_issue (data_issue_id, source_id, entity_kind, entity_key, issue, found_at) overriding system value "
           "values (9001, 777, 'game', '%s', 'x', '2026-10-01 12:00:00+00')" % k)
    psql(PROD, sql)
    psql(DS1, sql)
    psql(DS1, "update meta.data_issue set resolution = 'fixed', resolved_at = now()")
    n, _ = prep_daily(env)
    backdate(n)
    psql(PROD, "update meta.data_release set status = 'approved', approved_by = '%s', approved_at = now() where number = '%s'" % (AUTO, n))
    psql(DS1, "update meta.data_issue set issue = 'edited after the approval'")
    rc, out, err = env.rel("run")
    ok("a change to the issue text after the approval sends the release back to pending, untouched",
       status(n) == "pending" and psql(PROD, "select resolution is null from meta.data_issue where data_issue_id = 9001") == "t"
       and auto_of(n)["eligible"] is False and any("column issue changes" in r for r in auto_of(n)["reasons"]), out + err)


CASES = (auto_basic, auto_ineligible, auto_hold, auto_pause, auto_resume, auto_failure, auto_apply_checks, auto_drift, auto_issue_update)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="spx_stats", help="database to copy the small template from (only read)")
    ap.add_argument("--only", help="run only the named test functions (comma-separated)")
    a = ap.parse_args()
    T.make_base(a.source)
    env = T.Env()
    try:
        for fn in CASES:
            if a.only and fn.__name__ not in a.only.split(","):
                continue
            print("--- " + fn.__name__, flush=True)
            fn(env)
    finally:
        env.close()
    print("\n%d failed" % len(T.failures) if T.failures else "\nall passed")
    for f in T.failures:
        print("  FAILED: " + f)
    return 1 if T.failures else 0


if __name__ == "__main__":
    sys.exit(main())
