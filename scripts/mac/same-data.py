#!/usr/bin/env python3
"""Is what a build would read the same data as production? Used by deploy-prebuilt.sh.

    python3 -I scripts/mac/same-data.py LOCAL_REST_URL PRODUCTION_REST_URL PRODUCTION_KEY
    python3 -I scripts/mac/same-data.py --tables --ds1-dsn DSN --prod-dsn DSN

The first form checks two api views over PostgREST, then every published table (core, meta, ref, the same list as
scripts/sync/compare.py) by row count and the drift check's bucket hashes. The DS1 side of a table in PUBLISH_FILTER is
filtered the same way a release compares it. DS1 is the PG* environment (or SPX_DS1_HOST); production is the Supabase
Management API with SUPABASE_ACCESS_TOKEN or the keychain item 'spx-stats SUPABASE_ACCESS_TOKEN' (read here, never printed).

    --tables --ds1-dsn --prod-dsn [--turso-url URL]
                                    the table check only, both sides Postgres (the tests). No network, no keychain. The Turso tables are
                                    compared with the libSQL server at URL (a test server) or, without it, skipped with a note.

The tables in scripts/release/turso.py (TABLES: meta.verification, meta.data_issue, core.external_id, core.batted_ball_player,
core.betting_line and the derived api tables) are not on production: releases publish them to Turso. They are compared DS1 against Turso
with the same code the release runner uses (turso.diff_table), never against production. Turso comes from TURSO_DATABASE_URL and
TURSO_AUTH_TOKEN (or TURSO_READ_TOKEN), else the keychain items 'spx-stats TURSO_DATABASE_URL' and 'spx-stats TURSO_READ_TOKEN' (the ones
deploy-prebuilt.sh gives the build; read here, never printed). With no Turso credentials these tables are skipped with a printed note and are
not counted as differences; credentials that fail to read are exit 2.

Exit code 0 the same, 1 different (one line per table), 2 one side could not be read.
"""
import importlib.util
import json
import os
import subprocess
import sys
import time
import types
import urllib.error
import urllib.request

VIEWS = (("data_version", "select=number"), ("season_summary", "select=*&order=league.asc,year.asc"))
PAGE = 1000


def read(base, view, query, key=None):
    rows = []
    for page in range(20):
        headers = {"Accept-Profile": "api", "Accept": "application/json", "Range": "%d-%d" % (page * PAGE, page * PAGE + PAGE - 1),
                   "User-Agent": "spx-stats-same-data/1"}
        if key:
            headers["apikey"] = key
        req = urllib.request.Request("%s%s?%s" % (base, view, query), headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                part = json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 416:
                break
            raise
        rows += part
        if len(part) < PAGE:
            break
    return rows


def _compare():
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sync", "compare.py")
    spec = importlib.util.spec_from_file_location("spx_sync_compare", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _turso_module():
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "release", "turso.py")
    spec = importlib.util.spec_from_file_location("spx_release_turso", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _n(n):
    return format(int(n), ",")


def _count(side, name, compare):
    schema, table = name.split(".", 1)
    fq = "%s.%s" % (compare.qi(schema), compare.qi(table))
    cond = compare.PUBLISH_FILTER.get(name) if getattr(side, "source", False) else None
    src = "(select * from %s where %s) pf_" % (fq, cond) if cond else fq
    return side.run("select count(*) as n from %s" % src)[0]["n"]


def turso_report(ds1, turso_side, names, tmod):
    """DS1 against Turso for the tables of turso.TABLES, with the release runner's own comparison. Returns (differences, lines).
    A Turso read that fails raises TursoError (the caller exits 2)."""
    ctx = types.SimpleNamespace(ds1=ds1, turso=turso_side, turso_url=None)
    lines, bad = [], 0
    tabs = tmod.load_tables(ctx, names)
    for name in names:
        t, blockers, _ = tabs[name]
        if t is None or blockers:
            lines.append("same-data: %s: DS1 vs Turso: %s" % (name, "; ".join(blockers) or "cannot be compared"))
            bad += 1
            continue
        d = tmod.diff_table(ctx, t)
        if d["only1"] or d["only2"] or d["differ"]:
            lines.append("same-data: %s: DS1 %s / Turso %s (only in DS1 %d, only in Turso %d, different %d)"
                         % (name, _n(d["ds1"]), _n(d["prod"]), len(d["only1"]), len(d["only2"]), len(d["differ"])))
            bad += 1
    return bad, lines


def table_report(ds1, prod, turso_side=None):
    """Compare every published table. Returns (exit code, lines). Reuses compare.py: catalog, Table, count_rows, bucket_pass.
    The tables of turso.TABLES are never compared with production: with turso_side they go DS1 against Turso, without it they are
    skipped with a note and do not count."""
    compare = _compare()
    tmod = _turso_module()
    started = time.monotonic()
    c1, c2 = compare.catalog(ds1), compare.catalog(prod)
    lines, bad = [], 0
    tnames = sorted(tmod.TABLES)
    names = sorted((set(c1) | set(c2)) - set(tnames))
    for name in names:
        if name not in c1 or name not in c2:
            n1 = _count(ds1, name, compare) if name in c1 else None
            n2 = _count(prod, name, compare) if name in c2 else None
            lines.append("same-data: %s: DS1 %s / production %s" % (name, "absent" if n1 is None else _n(n1), "absent" if n2 is None else _n(n2)))
            bad += 1
            continue
        table = compare.Table(name, c1[name], c2[name])
        if not table.pk:
            lines.append("same-data: %s: no primary key" % name)
            bad += 1
            continue
        n1, n2 = compare.count_rows(ds1, table), compare.count_rows(prod, table)
        rows_differ = False
        if n1 == n2:
            rows_differ = compare.bucket_pass(ds1, table, n1) != compare.bucket_pass(prod, table, n2)
        if n1 != n2 or rows_differ:
            extra = " (rows differ)" if rows_differ and n1 == n2 else ""
            lines.append("same-data: %s: DS1 %s / production %s%s" % (name, _n(n1), _n(n2), extra))
            bad += 1
    total = len(names)
    if tnames and turso_side is None:
        lines.append("same-data: SKIPPED %d Turso tables (no Turso credentials: TURSO_DATABASE_URL and TURSO_READ_TOKEN or keychain), "
                     "not compared and not counted: %s" % (len(tnames), ", ".join(tnames)))
    elif tnames:
        tbad, tlines = turso_report(ds1, turso_side, tnames, tmod)
        bad += tbad
        lines += tlines
        total += len(tnames)
        if not tbad:
            lines.append("same-data: %d Turso tables equal DS1" % len(tnames))
    took = time.monotonic() - started
    if bad:
        lines.append("same-data: %d published tables, %d differ (%.0fs)" % (total, bad, took))
    else:
        lines.append("same-data: %d published tables, all equal (%.0fs)" % (total, took))
    return (1 if bad else 0), lines


def _keychain(service):
    r = subprocess.run(["security", "find-generic-password", "-s", service, "-w"], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else ""


def _live_turso():
    """The Turso side from the environment or the keychain, or None when there are no credentials. Never printed."""
    url = os.environ.get("TURSO_DATABASE_URL") or _keychain("spx-stats TURSO_DATABASE_URL")
    token = os.environ.get("TURSO_AUTH_TOKEN") or os.environ.get("TURSO_READ_TOKEN") or _keychain("spx-stats TURSO_READ_TOKEN")
    if not url or not token:
        return None
    return _turso_module().TursoSide(url, token)


def _live_sides():
    """DS1 from the PG* environment, production from the Management API. The token is never printed."""
    compare = _compare()
    if not os.environ.get("PGPASSWORD"):
        os.environ["PGPASSWORD"] = os.environ.get("SPX_DS1_DB_PASSWORD") or _keychain("spx-stats-db DS1 55440")
    if not os.environ.get("PGHOST") and os.environ.get("SPX_DS1_HOST"):
        os.environ["PGHOST"] = os.environ["SPX_DS1_HOST"]
    os.environ.setdefault("PGPORT", os.environ.get("SPX_DS1_PORT", "55440"))
    os.environ.setdefault("PGUSER", os.environ.get("SPX_DS1_DB_USER", "postgres"))
    os.environ.setdefault("PGDATABASE", os.environ.get("SPX_DS1_DB_NAME", "spx_stats"))
    token = os.environ.get("SUPABASE_ACCESS_TOKEN") or _keychain("spx-stats SUPABASE_ACCESS_TOKEN")
    if not token or not os.environ.get("PGPASSWORD"):
        raise RuntimeError("DS1 password or production token is missing")
    return compare.PsqlSide("DS1"), compare.ApiSide(compare.PROJECT_REF, token), _live_turso()


def _tables_from_args(argv):
    dsn = {}
    args = argv[2:]
    while args:
        if args[0] in ("--ds1-dsn", "--prod-dsn", "--turso-url") and len(args) > 1:
            dsn[args[0]] = args[1]
            args = args[2:]
        else:
            print(__doc__)
            return 2
    if "--ds1-dsn" not in dsn or "--prod-dsn" not in dsn:
        print(__doc__)
        return 2
    compare = _compare()
    try:
        turso = _turso_module().TursoSide(dsn["--turso-url"]) if "--turso-url" in dsn else None
        code, lines = table_report(compare.PsqlSide("DS1", dsn["--ds1-dsn"]), compare.PsqlSide("production", dsn["--prod-dsn"], source=False), turso)
    except Exception as e:  # noqa: BLE001
        print("same-data: could not compare published tables: %s" % e)
        return 2
    print("\n".join(lines))
    return code


def main(argv):
    if len(argv) > 1 and argv[1] == "--tables":
        return _tables_from_args(argv)
    if len(argv) != 4:
        print(__doc__)
        return 2
    local, prod, key = argv[1], argv[2].rstrip("/") + "/", argv[3]
    local = local.rstrip("/") + "/"
    bad = 0
    for view, query in VIEWS:
        try:
            a = read(local, view, query)
        except Exception as e:  # noqa: BLE001
            print("same-data: could not read %s from the local PostgREST: %s" % (view, e))
            return 2
        try:
            b = read(prod, view, query, key)
        except Exception as e:  # noqa: BLE001
            print("same-data: could not read %s from production: %s" % (view, e))
            return 2
        if a == b:
            print("same-data: %s same (%d rows)" % (view, len(a)))
            continue
        bad = 1
        ka = {json.dumps(x, sort_keys=True) for x in a}
        kb = {json.dumps(x, sort_keys=True) for x in b}
        print("same-data: %s DIFFERS (DS1 %d rows, production %d rows)" % (view, len(a), len(b)))
        for tag, only in (("only on DS1", sorted(ka - kb)), ("only in production", sorted(kb - ka))):
            for row in only[:5]:
                print("  %s: %s" % (tag, row[:200]))
            if len(only) > 5:
                print("  ... %d more %s" % (len(only) - 5, tag))
    try:
        code, lines = table_report(*_live_sides())
    except Exception as e:  # noqa: BLE001
        print("same-data: could not compare published tables: %s" % e)
        return 2
    print("\n".join(lines))
    return 1 if bad or code else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
