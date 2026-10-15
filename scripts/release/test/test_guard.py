#!/usr/bin/env python3
"""The release size guard and the per-view refresh after a release.

    TEST_ORDER_PORT=7741 python3 -I scripts/release/test/test_guard.py

Part 1 is arithmetic only (estimate_bytes, size_estimate, size_problem, guardrails), with the two releases whose estimates were wrong on
2026-10-15. Part 2 starts a throwaway Postgres (the helpers of test_apply_order.py: initdb from PATH, else Docker postgres:17-alpine,
on TEST_ORDER_PORT, default 7740, in 7700-7799) with a small schema api and the real refresh functions of migration 097, and runs
refresh_production against it: every view as its own statement, a view that fails or times out is recorded and the rest still run.
Exit code: 0 all passed, 1 a check failed.
"""
import os
import re
import shutil
import sys
import types

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import test_apply_order as T  # noqa: E402  (loads release.py as T.R)

R = T.R
MB = 1048576
failures = []


def ok(name, cond, detail=""):
    print("%s  %s%s" % ("PASS" if cond else "FAIL", name, ("  -> " + str(detail)) if (detail and not cond) else ""), flush=True)
    if not cond:
        failures.append(name)


def table(name, rows, heap_row, ratio, add=0, change=0, remove=0):
    """A table with `rows` rows of heap_row bytes and an index/heap ratio; returns its preview figures like build_preview makes them."""
    heap = rows * heap_row
    sizes = {"heap": heap, "index": int(heap * ratio)}
    delta, end, peak = R.estimate_bytes(add, change, remove, rows, sizes)
    return name, {"prod_rows": rows, "add": add, "change": change, "remove": remove, "bytes_delta": delta, "bytes_delta_end": end,
                  "bytes_delta_staged": peak,
                  "old_peak": 2 * (add + change) * (heap + sizes["index"]) / rows}


def old_estimate(db, tables):
    """The formula before this change: 2 * (add + change) * (total size / rows), added to the database size."""
    return db + sum(p["old_peak"] for p in tables.values())


def arithmetic():
    # one table, plain numbers: 1,000 rows of 100 bytes, indexes 50 % of the heap; estimate_bytes returns (delta, end, peak)
    s = {"heap": 100000, "index": 50000}
    e = R.estimate_bytes
    ok("an insert takes its row once, plus the index growth", e(10, 0, 0, 1000, s) == (1500, 1500, 1500), e(10, 0, 0, 1000, s))
    ok("a change: one new version at the end (nothing after vacuum), two at the peak (old and new until vacuum)",
       e(0, 10, 0, 1000, s) == (0, 1000, 2000), e(0, 10, 0, 1000, s))
    ok("a removal frees nothing before vacuum (end 0), is counted once at the peak as a margin, and is gone after vacuum",
       e(0, 0, 10, 1000, s) == (-1500, 0, 1000), e(0, 0, 10, 1000, s))
    ok("add, change and remove together", e(10, 10, 10, 1000, s) == (0, 1500 + 1000, 1500 + 2000 + 1000), e(10, 10, 10, 1000, s))
    ok("nothing to do is nothing", e(0, 0, 0, 1000, s) == (0, 0, 0))
    ok("a table with no rows yet uses the default row and no index growth", e(10, 0, 0, 0, None) == (10 * R.DEFAULT_ROW_BYTES,) * 3)
    ok("a table with rows but no size figures uses the default row too", e(5, 0, 0, 100, {"heap": 0, "index": 0}) == (1000, 1000, 1000))
    ok("a table without indexes has no index growth", e(10, 0, 0, 1000, {"heap": 100000, "index": 0}) == (1000, 1000, 1000))
    ok("an insert never counts twice", e(1000, 0, 0, 1000, s) == (150000, 150000, 150000))

    # size_estimate / size_problem: end from bytes_delta_end, peak from bytes_delta_staged, a negative figure counts as 0
    per = {"a": {"bytes_delta": 5 * MB, "bytes_delta_end": 5 * MB, "bytes_delta_staged": 8 * MB},
           "b": {"bytes_delta": -2 * MB, "bytes_delta_end": 1 * MB, "bytes_delta_staged": 3 * MB}}
    ok("size_estimate sums end and peak over the tables", R.size_estimate(100 * MB, per) == (106 * MB, 111 * MB), R.size_estimate(100 * MB, per))
    ok("a preview without bytes_delta_end falls back to bytes_delta, never below 0",
       R.size_estimate(1, {"a": {"bytes_delta": -9 * MB, "bytes_delta_staged": 0}}) == (1, 1))
    ok("under the limit there is no blocker", R.size_problem(100 * MB, per, limit=112 * MB) is None)
    msg = R.size_problem(100 * MB, per, limit=110 * MB)
    ok("over the limit the blocker names the peak, the end and the limit", msg and "111 MB" in msg and "106 MB" in msg and "110 MB" in msg
       and msg.startswith("production would reach"), msg)
    ok("the limit is on the peak, not the end", R.size_problem(100 * MB, per, limit=108 * MB) is not None)
    quiet = {"prod_rows": 100, "add": 0, "remove": 0, "bytes_delta": 0, "bytes_delta_end": 0, "bytes_delta_staged": 0}
    ok("guardrails with a small release has no problem", R.guardrails({"t": quiet}, False, 10 * MB) == [])
    big = R.guardrails({"t": dict(quiet, bytes_delta_staged=600 * MB)}, False, 10 * MB)
    ok("guardrails passes the size blocker on", len(big) == 1 and big[0].startswith("production would reach"), big)


def real_cases():
    # Release 2026.10.15 (roster): production held 224 MB; 176,733 new roster stints, 66,000 new people and external ids, changed and removed rows (a reconstruction of the shape: only the totals are known).
    # Estimated 514 MB with the old formula, real result 369 MB.
    roster = dict([
        table("core.roster_stint", 10000, 400, 0.45, add=176733),
        table("core.person", 70000, 260, 0.50, add=66000, change=40000),
        table("core.external_id", 400000, 110, 0.80, add=66000),
        table("meta.data_issue", 100000, 150, 0.3, remove=45000),
    ])
    db = 224 * MB
    old = old_estimate(db, roster) / MB
    end, peak = R.size_estimate(db, roster)
    print("roster release: old estimate %.0f MB, new peak %.0f MB, new end %.0f MB (real result 369 MB)" % (old, peak / MB, end / MB))
    ok("roster: the old formula gave about 514 MB", 505 <= old <= 535, old)
    ok("roster: the new peak is between 383 and 430 MB", 383 <= peak / MB <= 430, peak / MB)
    ok("roster: the new end is near the real 369 MB", 360 <= end / MB <= 385, end / MB)
    ok("roster: it passes the 450 MB guard", R.size_problem(db, roster, limit=450 * MB) is None)

    # Release 2026.10.15-4: 108,967 new player_season_stat rows, about 56 MB real; production at 370 MB; old estimate 482 MB.
    stats = dict([table("core.player_season_stat", 300000, 400, 0.285, add=108967)])
    db = 370 * MB
    old = old_estimate(db, stats) / MB
    end, peak = R.size_estimate(db, stats)
    print("player_season_stat release: old estimate %.0f MB, new peak %.0f MB, new end %.0f MB (real growth about 56 MB)" % (old, peak / MB, end / MB))
    ok("stats: the old formula gave about 482 MB", 475 <= old <= 490, old)
    ok("stats: the new peak is between 383 and 430 MB", 383 <= peak / MB <= 430, peak / MB)
    ok("stats: the new growth is near the real 56 MB", 52 <= (end - db) / MB <= 62, (end - db) / MB)
    ok("stats: it passes the 450 MB guard", R.size_problem(db, stats, limit=450 * MB) is None)
    ok("stats: it still stops at a limit under its peak", R.size_problem(db, stats, limit=int(peak) - MB) is not None)


# ------------------------------------------------------------------------------------------------------ part 2: the refresh

def refresh_functions():
    """The refresh_order / refresh_one / refresh_all part of migration 097, as written there."""
    text = open(os.path.join(T.HERE, "..", "..", "..", "db", "migrations", "097_matview_concurrent_refresh.sql")).read()
    a = text.index("create or replace function api.refresh_order()")
    b = text.index("-- api.refresh(): what every caller")
    return text[a:b]


def refresh_case():
    db = "guard_prod"
    T.psql("postgres", "drop database if exists %s with (force)" % db)
    T.psql("postgres", "create database %s" % db)
    T.psql("postgres", "do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;"
                       " if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if; end $$")
    T.psql(db, """
        create schema api;
        create table public.div (n int);  insert into public.div values (1);
        create table public.src (k int primary key, v text); insert into public.src values (1, 'old'), (2, 'old');
        -- three views that refresh, one that fails when its source changes, one that takes too long
        create materialized view api.v_small as select k, v from public.src;
        create unique index on api.v_small (k);
        create materialized view api.v_other as select k, v || '!' as v from public.src;
        create unique index on api.v_other (k);
        create materialized view api.v_bad as select 1 / n as x from public.div;
        create unique index on api.v_bad (x);
        create materialized view api.v_slow as select 1 as k from (select pg_sleep(3)) s;
        create unique index on api.v_slow (k);
        create materialized view api.v_last as select k, v || '?' as v from public.src;
        create unique index on api.v_last (k);
    """ + refresh_functions())
    T.psql(db, "update public.src set v = 'new'; update public.div set n = 0")
    ctx = types.SimpleNamespace(prod=T.Prod(db))
    R.REFRESH_VIEW_SECONDS = 1
    seen = []
    orig_log = R.log
    R.log = lambda m: seen.append(m)
    detail = {}
    try:
        out = R.refresh_production(ctx, detail)
    finally:
        R.log = orig_log
    views = detail.get("views", {})
    ok("every view of api.refresh_order() is attempted", set(views) == {"api.v_small", "api.v_other", "api.v_bad", "api.v_slow", "api.v_last"}, views)
    ok("the failing view is recorded with its error", views.get("api.v_bad", "").startswith("failed") and "division by zero" in views["api.v_bad"], views)
    ok("the slow view is cut off by its own statement_timeout and recorded", views.get("api.v_slow", "").startswith("failed") and "timeout" in views["api.v_slow"], views)
    ok("the views that can refresh are ok", all(views.get(v) == "ok" for v in ("api.v_small", "api.v_other", "api.v_last")), views)
    ok("the result names the views that failed", out.startswith("failed: ") and "api.v_bad" in out and "api.v_slow" in out and "api.v_small" not in out, out)
    ok("the views after a failure were refreshed anyway",
       T.psql(db, "select string_agg(distinct v, ',') from api.v_small") == "new" and T.psql(db, "select string_agg(distinct v, ',') from api.v_last") == "new?"
       and T.psql(db, "select string_agg(distinct v, ',') from api.v_other") == "new!")
    ok("each failure is logged", sum("refresh of" in m for m in seen) == 2, seen)

    # all good
    T.psql(db, "update public.div set n = 1; drop materialized view api.v_slow")
    detail = {}
    out = R.refresh_production(ctx, detail)
    ok("with every view fine the result is ok", out == "ok" and set(detail["views"].values()) == {"ok"}, (out, detail))
    ok("it does not need the detail argument", R.refresh_production(ctx) == "ok")

    # production without migration 097: one api.refresh() call, as before
    old = "guard_old"
    T.psql("postgres", "drop database if exists %s with (force)" % old)
    T.psql("postgres", "create database %s" % old)
    T.psql(old, "create schema api; create table public.probe (n serial);\n"
                "create function api.refresh() returns void language sql as $$ insert into public.probe default values $$")
    detail = {}
    out = R.refresh_production(types.SimpleNamespace(prod=T.Prod(old)), detail)
    ok("without api.refresh_order it calls api.refresh() once", out == "ok" and T.psql(old, "select count(*) from public.probe") == "1" and "views" not in detail, (out, detail))
    T.psql(old, "create or replace function api.refresh() returns void language sql as $$ select 1 / 0 $$")
    out = R.refresh_production(types.SimpleNamespace(prod=T.Prod(old)))
    ok("and a failing api.refresh() is recorded", out.startswith("failed: ") and "division by zero" in out, out)
    for d in (db, old):
        T.psql("postgres", "drop database if exists %s with (force)" % d)


def main():
    print("--- arithmetic")
    arithmetic()
    print("--- the two real releases")
    real_cases()
    print("--- refresh, one view at a time")
    tmp, stop = T.start_server()
    try:
        refresh_case()
    finally:
        stop()
        shutil.rmtree(tmp, ignore_errors=True)
    print("\n%s" % ("all passed" if not failures else "FAILED: " + "; ".join(failures)))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
