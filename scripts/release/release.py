#!/usr/bin/env python3
"""Numbered, validated, logged data releases. DS1 is the only place data is written; production changes only here.

  prepare   check DS1, compare DS1 with production, write a pending release (with a preview) on both sides
  run       (the NAS runner calls this every minute) apply the releases John approved at /admin/data
  rollback  prepare a release that restores the snapshot of an earlier one (it needs approval like any other)
  drift     compare every table, write meta.sync_status, and propose one pending fix release when anything differs
  checks    run db/checks/*.sql on DS1 and print the result
  status    list the releases

Kinds: publish (make production match DS1 for the listed tables: insert, update and delete), ds1_step (run one
db/migrations or db/build file on DS1 in one transaction, at a pinned git sha), rollback.

DS1: psql with the PG* environment (SPX_DS1_HOST fills in the defaults, as in scripts/sync/compare.py).
Production: Supabase Management API with SUPABASE_ACCESS_TOKEN. The approval itself is made on production by the site
through api.approve_release (migration 045); nothing here approves anything.
Tests: --ds1-dsn points DS1 at any Postgres, --api-url points the production calls at a stand-in API.
Exit code: 0 ok, 1 refused or blocked, 2 error.
"""
import argparse
import datetime
import fcntl
import gzip
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sync"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import compare as C  # noqa: E402
import daily_lock  # noqa: E402

REPO = os.environ.get("RELEASE_REPO") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SNAP_DIR = os.environ.get("RELEASE_SNAPSHOT_DIR") or os.path.join(os.getcwd(), "release-snapshots")
MAX_DB_BYTES = int(float(os.environ.get("RELEASE_MAX_DB_MB", "450")) * 1024 * 1024)
SHRINK_LIMIT = 0.05
MAIN_REF = os.environ.get("RELEASE_MAIN_REF", "origin/main")
TABLE_RE = re.compile(r"^(core|meta|ref)\.[a-z_][a-z0-9_]*$")
RESERVED = {"meta.data_release", "meta.sync_status", "meta.release_secret", "meta.auto_approval", "meta.score_update_request", "meta.api_health_event", "meta.ops_status", "meta.ops_request"}
PUBLISH_KINDS = ("publish", "daily_scores")
AUTO_ACTOR = "auto:daily-scores"
AUTO_HOLD_MINUTES = 10
AUTO_TABLES = ("core.game", "meta.verification", "meta.data_issue")
AUTO_GAME_COLUMNS = {"status", "home_score", "away_score", "went_to_overtime", "decided_by_shootout", "overtime_periods",
                     "decided_by", "updated_at", "starts_at"}
AUTO_MAX_GAMES = 500
AUTO_MAX_SIDE_ROWS = 2000
AUTO_ISSUE_SOURCE = "wikipedia_daily"
AUTO_ISSUE_COLUMNS = {"resolution", "resolved_at"}
AUTO_DRIFT_DAYS = 14
REQUEST_PREFIX = "request:"
HEARTBEAT_MINUTES = 30
DAILY_TIMEOUT = int(os.environ.get("RELEASE_DAILY_TIMEOUT", "2400"))
REVALIDATE_MAX_TAGS = 100
STEP_FILE_RE = re.compile(r"^db/(migrations|build)/[A-Za-z0-9_.-]+\.sql$")
REQUEST_BYTES = 900_000
ROWS_PER_INSERT = 500
RELEASE_FIELDS = ("id", "number", "kind", "title", "notes", "ticket", "tables", "options", "status", "digest", "preview",
                  "checks", "result", "created_by", "created_at", "approved_by", "approved_at", "started_at",
                  "finished_at", "git_sha", "error")


class Refused(Exception):
    """The release must not go ahead (a guardrail, a failed check, something changed). The message is for John."""


class AfterCommit(RuntimeError):
    """A failure after production's data was changed (the apply committed, or a restore did). result is saved with the failed release."""

    def __init__(self, msg, result=None):
        super().__init__(msg)
        self.result = result


def log(msg):
    print("%s %s" % (datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S"), msg), flush=True)


def scrub(text):
    text = str(text)
    for name in ("SUPABASE_ACCESS_TOKEN", "PGPASSWORD", "REVALIDATE_SECRET"):
        v = os.environ.get(name)
        if v:
            text = text.replace(v, "***")
    return text[:1500]


def lit(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (dict, list)):
        return C.ql(json.dumps(v, sort_keys=True)) + "::jsonb"
    return C.ql(v)


def text_array(items):
    return "array[%s]::text[]" % ",".join(C.ql(x) for x in items) if items else "'{}'::text[]"


# ---------------------------------------------------------------------------------------------------- sides

def ds1_env():
    env = dict(os.environ)
    env["PGCONNECT_TIMEOUT"] = "15"
    env["PGOPTIONS"] = (env.get("PGOPTIONS", "") + " -c extra_float_digits=3").strip()
    if os.environ.get("SPX_DS1_HOST") and not env.get("PGHOST"):
        env["PGHOST"] = os.environ["SPX_DS1_HOST"]
        env.setdefault("PGPORT", "55440")
        env.setdefault("PGUSER", "postgres")
        env.setdefault("PGDATABASE", "spx_stats")
    return env


class Ds1Writer:
    """DS1 with write access, through psql. Used only for the release tables, the backup schemas and ds1_step files."""

    def __init__(self, dsn=None):
        self.dsn = dsn

    def sql(self, text, single_tx=True):
        cmd = ["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"]
        if single_tx:
            cmd.append("-1")
        if self.dsn:
            cmd.append(self.dsn)
        cmd += ["-f", "-"]
        r = subprocess.run(cmd, input=text, capture_output=True, text=True, env=ds1_env(), timeout=3600)
        if r.returncode != 0:
            raise RuntimeError("DS1: psql failed: %s" % r.stderr.strip()[:600])
        return r.stdout

    def exec(self, text):
        """Run statements in one transaction; if the last line printed is JSON, return it parsed."""
        lines = [x for x in self.sql(text).splitlines() if x.strip()]
        if not lines:
            return None
        try:
            return json.loads(lines[-1])
        except ValueError:
            return None

    def copy_in(self, target, cols, data):
        self.sql("copy %s (%s) from stdin;\n%s\\.\n" % (target, ",".join(C.qi(c) for c in cols), data))


def prod_exec(prod, text, attempts=5, timeout=300):
    """Run one query text on production; if it returns a row with a column j, return that value."""
    data = prod.post(text, attempts=attempts, timeout=timeout)
    if isinstance(data, list) and data and isinstance(data[0], dict) and "j" in data[0]:
        j = data[0]["j"]
        return json.loads(j) if isinstance(j, str) else j
    return None


class Ctx:
    def __init__(self, args):
        self.ds1 = C.PsqlSide("DS1", args.ds1_dsn)
        self.w = Ds1Writer(args.ds1_dsn)
        if not args.ds1_dsn and not (os.environ.get("SPX_DS1_HOST") or os.environ.get("PGHOST")):
            raise SystemExit("set SPX_DS1_HOST (or PGHOST) and PGPASSWORD for DS1")
        token = os.environ.get("SUPABASE_ACCESS_TOKEN")
        if not token:
            raise SystemExit("SUPABASE_ACCESS_TOKEN is not set")
        self.prod = C.ApiSide(args.project_ref, token, url=args.api_url)
        self.ds1_dsn = args.ds1_dsn
        self.daily_script = getattr(args, "daily_script", None) or os.path.join(REPO, "scripts", "daily", "run.py")
        self.by = getattr(args, "by", None) or "release.py"


# ---------------------------------------------------------------------------------------------------- git

def git(*a, check=True):
    r = subprocess.run(["git", "-C", REPO] + list(a), capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError("git %s: %s" % (" ".join(a), r.stderr.strip()[:300]))
    return r


def head_sha():
    r = git("rev-parse", "HEAD", check=False)
    return r.stdout.strip() if r.returncode == 0 else None


# ---------------------------------------------------------------------------------------------------- checks

def run_checks(ds1):
    """Every db/checks/*.sql returns zero rows when all is well. A check fails when it returns more rows than its baseline."""
    out = []
    folder = os.path.join(REPO, "db", "checks")
    for fn in sorted(os.listdir(folder)):
        if not fn.endswith(".sql"):
            continue
        text = open(os.path.join(folder, fn)).read()
        m = re.search(r"^--\s*baseline:\s*(\d+)", text, re.M)
        w = re.search(r"^--\s*what:\s*(.+)$", text, re.M)
        body = "\n".join(x for x in text.splitlines() if not x.lstrip().startswith("--")).strip().rstrip(";")
        sql = ("with q as (%s) select (select count(*) from q) as n, "
               "(select coalesce(json_agg(x), '[]'::json) from (select * from q limit 5) x) as sample" % body)
        r = ds1.run(sql)[0]
        base = int(m.group(1)) if m else 0
        out.append({"name": fn[:-4], "what": w.group(1).strip() if w else "", "baseline": base, "rows": r["n"],
                    "ok": r["n"] <= base, "sample": r["sample"]})
    return out


def check_blockers(checks):
    res = []
    for c in checks:
        if not c["ok"]:
            res.append("check %s: %d problem rows (known: %d). %s" % (c["name"], c["rows"], c["baseline"], c["what"]))
    return res


# ---------------------------------------------------------------------------------------------------- tables, preview

def fp(buckets):
    return hashlib.md5(json.dumps(sorted((b, n, m) for b, (n, m) in buckets.items())).encode()).hexdigest()


def table_sizes(side):
    """{table: {"heap": heap and toast bytes, "index": index bytes}} for every table of core, meta and ref."""
    rows = side.run("select c.relnamespace::regnamespace::text || '.' || c.relname as n, "
                    "pg_relation_size(c.oid) + coalesce(pg_total_relation_size(c.reltoastrelid), 0) as heap, pg_indexes_size(c.oid) as idx "
                    "from pg_class c where c.relkind in ('r', 'p') and c.relnamespace::regnamespace::text in ('core', 'meta', 'ref')")
    return {r["n"]: {"heap": int(r["heap"]), "index": int(r["idx"])} for r in rows}


DEFAULT_ROW_BYTES = 200


def estimate_bytes(add, change, remove, rows, sizes):
    """What a release does to the size of production, for one table. rows: the table's row count on the side `sizes` came from;
    sizes: {"heap", "index"} of that side's table (heap includes toast). Returns (delta, end, peak) in bytes, each to be added to the
    database size now:
      delta = (add - remove) * row * (1 + index/heap): the size change once vacuum has run (what the preview shows)
      end   = add * row * (1 + index/heap) + change * row: the size when the apply is done, before any vacuum. An inserted row takes
              its size once, plus the growth of the table's indexes (the table's index/heap ratio). A changed row adds its new
              version; the old one is dead but still counted in the size now. A deleted row stays until vacuum: it frees nothing.
      peak  = add * row * (1 + index/heap) + 2 * change * row + remove * row: the most it takes while the apply runs. A changed row
              counts twice (old and new version stand until vacuum), a removed row once more as a margin.
    row is the average heap row of the table (heap / rows). A table with no rows yet uses DEFAULT_ROW_BYTES and no index growth."""
    heap, index = (sizes or {}).get("heap", 0), (sizes or {}).get("index", 0)
    row = (heap / rows) if rows and heap else DEFAULT_ROW_BYTES
    ratio = (index / heap) if heap else 0.0
    delta = int((add - remove) * row * (1 + ratio))
    end = int(add * row * (1 + ratio) + change * row)
    peak = int(add * row * (1 + ratio) + 2 * change * row + remove * row)
    return delta, end, peak


def load_tables(ctx, names):
    """{name: (Table or None, blockers, warnings)} from both catalogs."""
    c1, c2 = C.catalog(ctx.ds1), C.catalog(ctx.prod)
    out = {}
    for n in names:
        if n not in c1:
            out[n] = (None, ["%s does not exist on DS1" % n], [])
        elif n not in c2:
            out[n] = (None, ["%s does not exist on production: run its migration there first" % n], [])
        else:
            t = C.Table(n, c1[n], c2[n])
            bl, wa = [], []
            for note in t.notes:
                (wa if note.startswith("columns only on production") else bl).append(note)
            if not t.pk:
                bl.append("no usable primary key on both sides")
            out[n] = (t, bl, wa)
    return out


def size_estimate(db_bytes, per_table):
    """(end, peak): production's size when the apply is done, and the most it reaches while it runs (estimate_bytes), from the
    per-table figures of a preview (bytes_delta_end, bytes_delta_staged). The one place prepare and the runner's re-check both read."""
    end = db_bytes + sum(max(p.get("bytes_delta_end", p["bytes_delta"]), 0) for p in per_table.values())
    peak = db_bytes + sum(max(p["bytes_delta_staged"], 0) for p in per_table.values())
    return end, peak


def size_problem(db_bytes, per_table, limit=None):
    """The blocker text when the peak passes the limit, else None. It shows the end size as well as the peak."""
    limit = MAX_DB_BYTES if limit is None else limit
    end, peak = size_estimate(db_bytes, per_table)
    if peak > limit:
        return ("production would reach about %d MB while the release is applied and end at about %d MB once it is done "
                "(limit %d MB on the peak)" % (peak // 1048576, end // 1048576, limit // 1048576))
    return None


def guardrails(per_table, replace, db_bytes):
    problems = []
    for n, p in per_table.items():
        after = p["prod_rows"] + p["add"] - p["remove"]
        if p["prod_rows"] > 0 and after < p["prod_rows"] * (1 - SHRINK_LIMIT) and not replace:
            problems.append("%s would shrink from %d to %d rows (more than %d%%); a release must say replace to allow it"
                            % (n, p["prod_rows"], after, round(SHRINK_LIMIT * 100)))
    big = size_problem(db_bytes, per_table)
    if big:
        problems.append(big)
    return problems


def diff_tables(ctx, names):
    """Compare each table. Returns ({name: (Table, diff)}, {name: blockers}, {name: warnings}); a table with a blocker has no diff."""
    tabs = load_tables(ctx, names)
    diffs, blockers, warnings = {}, {}, {}
    for n in names:
        t, bl, wa = tabs[n]
        blockers[n], warnings[n] = bl, wa
        if t is not None and t.pk and not bl:
            diffs[n] = (t, C.diff_table(ctx.ds1, ctx.prod, t))
    return diffs, blockers, warnings


def build_preview(ctx, names, replace, diffs, blockers, warnings):
    sd, sp = table_sizes(ctx.ds1), table_sizes(ctx.prod)
    db_bytes = ctx.prod.run("select pg_database_size(current_database()) as b")[0]["b"]
    per = {}
    for n in names:
        p = {"ds1_rows": None, "prod_rows": None, "add": 0, "change": 0, "remove": 0, "bytes_delta": 0, "bytes_delta_end": 0, "bytes_delta_staged": 0,
             "ds1_fp": None, "prod_fp": None, "blockers": list(blockers[n]), "warnings": list(warnings[n])}
        if n in diffs:
            t, d = diffs[n]
            p.update(ds1_rows=d["ds1"], prod_rows=d["prod"], add=len(d["only1"]), change=len(d["differ"]), remove=len(d["only2"]),
                     ds1_fp=fp(d["b1"]), prod_fp=fp(d["b2"]))
            # a table with rows on production is measured there; a table with none by its DS1 copy
            sizes, rows = (sp.get(n), d["prod"]) if d["prod"] else (sd.get(n), d["ds1"])
            p["bytes_delta"], p["bytes_delta_end"], p["bytes_delta_staged"] = estimate_bytes(p["add"], p["change"], p["remove"], rows, sizes)
        per[n] = p
    problems = guardrails({n: p for n, p in per.items() if n in diffs}, replace, db_bytes)
    all_blockers = ["%s: %s" % (n, b) for n, p in per.items() for b in p["blockers"]] + problems
    preview = {
        "tables": per, "blockers": all_blockers,
        "warnings": ["%s: %s" % (n, w) for n, p in per.items() for w in p["warnings"]],
        "totals": {k: sum(p[k] for p in per.values()) for k in ("add", "change", "remove", "bytes_delta")},
        "db_bytes": db_bytes,
    }
    preview["end_bytes"], preview["peak_bytes"] = size_estimate(db_bytes, {n: p for n, p in per.items() if n in diffs})
    return preview


def digest_of(kind, tables, options, git_sha, preview):
    fps = {n: [p.get("ds1_fp"), p.get("prod_fp")] for n, p in (preview.get("tables") or {}).items()}
    body = {"kind": kind, "tables": sorted(tables), "options": options, "git_sha": git_sha, "fps": fps,
            "file_sha256": preview.get("file_sha256"), "rollback_of": options.get("rollback_of")}
    return hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()


# ---------------------------------------------------------------------------------------------------- release rows

def insert_sql(row):
    cols = [c for c in RELEASE_FIELDS if c in row]
    vals = [text_array(row[c]) if c == "tables" else lit(row[c]) for c in cols]
    return "insert into meta.data_release (%s) values (%s)" % (",".join(cols), ",".join(vals))


def update_sql(rid, fields, from_status=None, extra=None):
    sets = []
    for k, v in fields.items():
        assert k in RELEASE_FIELDS and k != "id"
        sets.append("%s = %s" % (k, "now()" if v == "NOW" else text_array(v) if k == "tables" else lit(v)))
    where = "id = %d" % rid + (" and status = %s" % C.ql(from_status) if from_status else "") + (" and (%s)" % extra if extra else "")
    return ("with u as (update meta.data_release set %s where %s returning id) select count(*) as j from u"
            % (", ".join(sets), where))


def set_release(ctx, rid, fields, from_status=None):
    """Update the release on DS1, then on production; returns how many rows production changed."""
    ctx.w.exec(update_sql(rid, fields, from_status))
    return prod_exec(ctx.prod, update_sql(rid, fields, from_status))


def release_by_id(side, rid):
    r = side.run("select * from meta.data_release where id = %d" % rid)
    return r[0] if r else None


def create_release(ctx, row):
    today = datetime.datetime.now(datetime.timezone.utc).strftime("%Y.%m.%d")
    q = ("select coalesce(max(id), 0) as id, coalesce(max(split_part(number, '-', 2)::int) filter (where number like %s), 0) as seq "
         "from meta.data_release" % C.ql(today + "-%"))
    a, b = ctx.ds1.run(q)[0], ctx.prod.run(q)[0]
    row["id"] = max(a["id"], b["id"]) + 1
    row["number"] = "%s-%d" % (today, max(a["seq"], b["seq"]) + 1)
    row.setdefault("created_by", ctx.by)
    ctx.w.exec(insert_sql(row))
    try:
        prod_exec(ctx.prod, insert_sql(row), attempts=1)
    except Exception:
        ctx.w.exec("delete from meta.data_release where id = %d" % row["id"])
        raise
    return row


# ---------------------------------------------------------------------------------------------------- prepare

def valid_tables(raw):
    names = sorted({x.strip() for x in raw.split(",") if x.strip()})
    for n in names:
        if not TABLE_RE.match(n) or n in RESERVED or re.match(r"^meta\.r[sd]_[0-9]", n):
            raise SystemExit("not a table that can be released: %s (core, meta and ref tables only)" % n)
    if not names:
        raise SystemExit("--tables is required")
    return names


def prepare_publish(ctx, title, names, notes=None, ticket=None, replace=False, created_by=None, diff_cache=None, quiet=False,
                    kind="publish"):
    ordered(ctx, names)  # a foreign key loop among the tables is refused now, not at the apply
    checks = run_checks(ctx.ds1)
    if diff_cache is None:
        diffs, blockers, warnings = diff_tables(ctx, names)
    else:
        diffs, blockers, warnings = diff_cache
        diffs = {n: diffs[n] for n in names if n in diffs}
        blockers = {n: blockers.get(n, []) for n in names}
        warnings = {n: warnings.get(n, []) for n in names}
    preview = build_preview(ctx, names, replace, diffs, blockers, warnings)
    preview["blockers"] = check_blockers(checks) + preview["blockers"]
    if preview["totals"]["add"] + preview["totals"]["change"] + preview["totals"]["remove"] == 0 and not preview["blockers"]:
        raise Refused("DS1 and production already match for these tables: nothing to release")
    options = {"replace": True} if replace else {}
    if kind == "daily_scores":
        preview["auto"] = auto_review(ctx, names, diffs, preview)
    sha = head_sha()
    row = {"kind": kind, "title": title, "notes": notes, "ticket": ticket, "tables": names, "options": options,
           "status": "pending", "preview": preview, "checks": checks, "git_sha": sha,
           "digest": digest_of(kind, names, options, sha, preview)}
    if created_by:
        row["created_by"] = created_by
    row = create_release(ctx, row)
    if not quiet:
        print_preview(row)
    return row


def print_preview(row):
    pv = row["preview"]
    print("release %s (%s): %s" % (row["number"], row["kind"], row["title"]))
    for n, p in (pv.get("tables") or {}).items():
        print("  %-28s +%d ~%d -%d  (DS1 %s, production %s)" % (n, p["add"], p["change"], p["remove"], p["ds1_rows"], p["prod_rows"]))
    if pv.get("file"):
        print("  file %s at %s" % (pv["file"], (row.get("git_sha") or "")[:10]))
        for k, v in (pv.get("after") or {}).items():
            print("  %-28s %s -> %s" % (k, (pv.get("before") or {}).get(k), v))
    for b in pv.get("blockers") or []:
        print("  BLOCKER: " + b)
    for w in pv.get("warnings") or []:
        print("  warning: " + w)
    auto = pv.get("auto")
    if auto and auto.get("eligible"):
        print("  auto-approval: eligible (%d games); approved by %s %d minutes after it was prepared unless held or paused"
              % (auto.get("games", 0), AUTO_ACTOR, auto.get("hold_minutes", AUTO_HOLD_MINUTES)))
    elif auto:
        for why in auto.get("reasons") or []:
            print("  NOT auto-approved: " + why)
    print("  status: pending%s; approve it at /admin/data" % (" (blocked, cannot be approved)" if pv.get("blockers") else ""))


def mentioned_tables(sql):
    names = re.findall(r"\b(?:core|meta|ref|api|legacy_[a-z0-9_]+)\.[a-z_][a-z0-9_]*", sql, re.I)
    return sorted({x.lower() for x in names})[:30]


def clean_step_sql(body):
    if re.search(r"^\s*\\", body, re.M):
        raise Refused("the file contains a psql backslash command; a release file is plain SQL")
    if re.search(r"^\s*(rollback|savepoint|release\s+savepoint)\b", body, re.I | re.M):
        raise Refused("the file manages its own transaction")
    return re.sub(r"^\s*(begin|commit)\s*;[ \t]*$", "", body, flags=re.I | re.M)


def file_at(sha, path):
    r = subprocess.run(["git", "-C", REPO, "show", "%s:%s" % (sha, path)], capture_output=True)
    if r.returncode != 0:
        subprocess.run(["git", "-C", REPO, "fetch", "--quiet", "origin", sha], capture_output=True)
        r = subprocess.run(["git", "-C", REPO, "show", "%s:%s" % (sha, path)], capture_output=True)
    if r.returncode != 0:
        raise Refused("git cannot show %s at %s" % (path, sha[:10]))
    return r.stdout


def run_step(ctx, body_sql, checks, commit):
    """Run the file on DS1 in one transaction, with table counts before and after and the checks before and after.
    Rolls back (and says so) if any check has more problem rows afterwards than before. commit False = dry run."""
    names = mentioned_tables(body_sql)
    arr = "array[%s]::text[]" % ",".join(C.ql(n) for n in names) if names else "array[]::text[]"

    def counts(tag):
        return ("select '@@%s ' || coalesce(json_object_agg(n, c)::text, '{}') from (select n, "
                "(xpath('/row/c/text()', query_to_xml('select count(*) as c from ' || n, false, true, '')))[1]::text::bigint as c "
                "from unnest(%s) n where to_regclass(n) is not null and (select relkind from pg_class where oid = to_regclass(n)) in ('r', 'p', 'm')) q;"
                % (tag, arr))
    check_sql = []
    for c in checks:
        body = "\n".join(x for x in open(os.path.join(REPO, "db", "checks", c["name"] + ".sql")).read().splitlines()
                         if not x.lstrip().startswith("--")).strip().rstrip(";")
        check_sql.append(body)
    s = ["\\set ON_ERROR_STOP on", "begin;", counts("before")]
    for i, body in enumerate(check_sql):
        s.append("select count(*) as pre%d from (%s) q \\gset" % (i, body))
    s.append(body_sql)
    s.append(counts("after"))
    for i, body in enumerate(check_sql):
        s.append("select count(*) > :pre%d as bad%d from (%s) q \\gset" % (i, i, body))
    s.append("select (%s) as bad \\gset" % (" or ".join(":'bad%d'::boolean" % i for i in range(len(check_sql))) or "false"))
    s.append("select '@@bad ' || :'bad';")
    s.append("\\if :bad\nrollback;\nselect '@@result worse';\n\\else\n%s;\nselect '@@result %s';\n\\endif"
             % ("commit" if commit else "rollback", "committed" if commit else "dry_run"))
    cmd = ["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"] + ([ctx.w.dsn] if ctx.w.dsn else []) + ["-f", "-"]
    r = subprocess.run(cmd, input="\n".join(s) + "\n", capture_output=True, text=True, env=ds1_env(), timeout=7200)
    out = {"tables": names}
    for line in r.stdout.splitlines():
        m = re.match(r"^@@(before|after) (.*)$", line)
        if m:
            out[m.group(1)] = json.loads(m.group(2))
        m = re.match(r"^@@result (\w+)$", line)
        if m:
            out["result"] = m.group(1)
    if r.returncode != 0:
        out["error"] = "psql failed: " + r.stderr.strip()[:600]
    return out


def prepare_step(ctx, title, path, notes=None, ticket=None):
    if not STEP_FILE_RE.match(path or ""):
        raise SystemExit("--file must be db/migrations/NAME.sql or db/build/NAME.sql")
    sha = head_sha()
    if not sha:
        raise SystemExit("not a git checkout")
    if git("ls-files", "--error-unmatch", path, check=False).returncode != 0 or git("diff", "--quiet", "HEAD", "--", path, check=False).returncode != 0:
        raise SystemExit("%s must be committed and unchanged" % path)
    blockers = []
    if git("merge-base", "--is-ancestor", sha, MAIN_REF, check=False).returncode != 0:
        blockers.append("commit %s is not on %s: push it first, then prepare again" % (sha[:10], MAIN_REF))
    content = file_at(sha, path)
    body = clean_step_sql(content.decode())
    checks = run_checks(ctx.ds1)
    blockers += check_blockers(checks)
    dry = run_step(ctx, body, checks, commit=False)
    if dry.get("error"):
        blockers.append("the file fails on DS1: " + dry["error"])
    elif dry.get("result") == "worse":
        blockers.append("the file makes a check worse on DS1")
    preview = {"file": path, "file_sha256": hashlib.sha256(content).hexdigest(), "git_sha": sha,
               "before": dry.get("before"), "after": dry.get("after"), "dry_run": True, "blockers": blockers, "warnings": [],
               "tables": {}, "totals": {}}
    row = {"kind": "ds1_step", "title": title, "notes": notes, "ticket": ticket, "tables": dry.get("tables", []),
           "options": {"file": path}, "status": "pending", "preview": preview, "checks": checks, "git_sha": sha,
           "digest": digest_of("ds1_step", dry.get("tables", []), {"file": path}, sha, preview)}
    row = create_release(ctx, row)
    print_preview(row)
    return row


# ---------------------------------------------------------------------------------------------------- snapshot, stage, apply

def tsv_cell(v):
    if v is None:
        return "\\N"
    return v.replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r")


def tuple_expr(t):
    return "'(' || concat_ws(',', %s) || ')'" % ",".join("quote_nullable(%s)" % C.vexpr(c) for c in t.insert_cols)


def read_tuples(ds1, t, keys, source=None):
    """VALUES tuples (as SQL text) for the given keys, read from a DS1 table, in key order."""
    order = ",".join(C.cexpr(k, t.types[k]) + ' collate "C"' for k in t.pk)
    keys = sorted(keys)
    for i in range(0, len(keys), 2000):
        part = keys[i:i + 2000]
        for r in ds1.run("select %s as v from %s where %s order by %s" % (tuple_expr(t), source or t.src(ds1), t.key_filter(part), order)):
            yield r["v"]


def read_all_tuples(ds1, t, source):
    order = ",".join(C.qi(k) for k in t.pk)
    off = 0
    while True:
        rows = ds1.run("select %s as v from %s order by %s limit 2000 offset %d" % (tuple_expr(t), source, order, off))
        for r in rows:
            yield r["v"]
        if len(rows) < 2000:
            return
        off += 2000


def key_literals(t, keys):
    out = []
    for k in keys:
        out.append("(%s)" % ",".join(C.ql(v + "+00" if t.types[c].startswith("timestamp with time zone") else v) for c, v in zip(t.pk, k)))
    return out


def send_batches(prod, statements):
    """Send statements in requests of about REQUEST_BYTES. Every statement is on conflict do nothing, so a retry is harmless."""
    buf, size = [], 0
    for st in statements:
        if buf and size + len(st) > REQUEST_BYTES:
            prod_exec(prod, ";\n".join(buf))
            buf, size = [], 0
        buf.append(st)
        size += len(st)
    if buf:
        prod_exec(prod, ";\n".join(buf))


def insert_statements(target, cols, tuples):
    head = "insert into %s (%s) values\n" % (target, ",".join(C.qi(c) for c in cols))
    batch = []
    for tp in tuples:
        batch.append(tp)
        if len(batch) >= ROWS_PER_INSERT:
            yield head + ",\n".join(batch) + "\non conflict do nothing"
            batch = []
    if batch:
        yield head + ",\n".join(batch) + "\non conflict do nothing"


class Stage:
    """Staging tables on production for one release: the rows to insert or update, and the keys to delete. Dropped at the end."""

    def __init__(self, prod, rid):
        self.prod, self.rid, self.names = prod, rid, []

    def create(self, kind, i, t, cols):
        name = "meta.r%s_%d_%d" % (kind, self.rid, i)
        self.names.append(name)
        prod_exec(self.prod, "drop table if exists %s;\ncreate unlogged table %s as select %s from %s with no data;\nalter table %s add primary key (%s)"
                  % (name, name, ",".join(C.qi(c) for c in cols), t.fq, name, ",".join(C.qi(k) for k in t.pk)))
        return name

    def drop(self):
        try:
            if self.names:
                prod_exec(self.prod, ";\n".join("drop table if exists %s" % n for n in self.names))
        except Exception as e:  # noqa: BLE001 - cleanup must not hide the real error
            log("could not drop the staging tables %s: %s" % (self.names, scrub(e)))


def apply_block(steps):
    """One DO block, ordered so every foreign key and unique key holds after every statement (production's keys are not
    deferrable, and the block must not change them). steps are in parents-first order. A "fresh" step is a table nothing
    references; every other step is a referenced table. In order:
      1. fresh tables, children first: delete the removals and the rows about to be written, so a row that is replaced by one with
         another id but the same natural key (or rows that swap unique values) cannot collide. Nothing references these rows.
      2. every table, parents first: insert or update the changed rows (new parents exist before the children that point at them,
         and children are re-pointed away from the rows about to go).
      3. referenced tables, children first: delete the removals. By now no kept row points at them.
    Then count checks, sequence resets, drop the stages. A single statement, so it commits or rolls back as a whole whatever the
    API does with a multi-statement text. A table that is both referenced and has a unique natural key that a removed row shares
    with an incoming one cannot be ordered this way: the block fails on the unique key, and production is unchanged."""
    out = ["do $apply$ begin"]
    for s in reversed(steps):
        if not s.get("fresh"):
            continue
        t = s["t"]
        if s["del"]:
            cond = " and ".join("t.%s = d.%s" % (C.qi(k), C.qi(k)) for k in t.pk)
            out.append("delete from %s t using %s d where %s;" % (t.fq, s["del"], cond))
        if s["up"]:
            cond = " and ".join("t.%s = u.%s" % (C.qi(k), C.qi(k)) for k in t.pk)
            out.append("delete from %s t using %s u where %s;" % (t.fq, s["up"], cond))
    for s in steps:
        t = s["t"]
        cols = ",".join(C.qi(c) for c in t.insert_cols)
        pk = ",".join(C.qi(k) for k in t.pk)
        rest = [c for c in t.insert_cols if c not in t.pk]
        if s.get("fresh"):
            tail = ""
        elif rest:
            sets = ", ".join("%s = excluded.%s" % (C.qi(c), C.qi(c)) for c in rest)
            old = ", ".join("%s.%s::text" % (t.fq, C.qi(c)) for c in rest)
            new = ", ".join("excluded.%s::text" % C.qi(c) for c in rest)
            tail = "on conflict (%s) do update set %s where (%s) is distinct from (%s)" % (pk, sets, old, new)
        else:
            tail = "on conflict (%s) do nothing" % pk
        if s["up"]:
            out.append("insert into %s (%s) overriding system value select %s from %s %s;" % (t.fq, cols, cols, s["up"], tail))
    for s in reversed(steps):
        t = s["t"]
        if s["del"] and not s.get("fresh"):
            cond = " and ".join("t.%s = d.%s" % (C.qi(k), C.qi(k)) for k in t.pk)
            out.append("delete from %s t using %s d where %s;" % (t.fq, s["del"], cond))
    for s in steps:
        t = s["t"]
        out.append("if (select count(*) from " + t.fq + ") <> " + str(s["expected"]) + " then raise exception 'row count of "
                   + t.name + " does not match after the change'; end if;")
        for c in t.identity_cols:
            out.append("perform setval(pg_get_serial_sequence(%s, %s), coalesce((select max(%s) from %s), 1));"
                       % (C.ql(t.fq), C.ql(c), C.qi(c), t.fq))
    for s in steps:
        for n in (s["up"], s["del"]):
            if n:
                out.append("drop table %s;" % n)
    out.append("end $apply$")
    return "\n".join(out)


def stage_and_apply(ctx, rid, plan):
    """plan: [{t, ups: iterable of VALUES tuples or None, dels: key list, expected: rows after}] in parents-first order."""
    st = Stage(ctx.prod, rid)
    try:
        steps = []
        for i, p in enumerate(plan):
            t = p["t"]
            step = {"t": t, "up": None, "del": None, "expected": p["expected"], "fresh": p.get("fresh", False)}
            if p["ups"] is not None:
                step["up"] = st.create("s", i, t, t.insert_cols)
                send_batches(ctx.prod, insert_statements(step["up"], t.insert_cols, p["ups"]))
            if p["dels"]:
                step["del"] = st.create("d", i, t, t.pk)
                lits = key_literals(t, p["dels"])
                head = "insert into %s (%s) values\n" % (step["del"], ",".join(C.qi(k) for k in t.pk))
                send_batches(ctx.prod, (head + ",\n".join(lits[j:j + 1000]) + "\non conflict do nothing" for j in range(0, len(lits), 1000)))
            steps.append(step)
        prod_exec(ctx.prod, apply_block(steps), attempts=1, timeout=900)
    finally:
        st.drop()


def write_gz(path, text):
    with gzip.open(path, "wt", encoding="utf-8", newline="\n") as f:
        f.write(text)


def snapshot(ctx, rid, number, items):
    """Save production's current rows for everything the release will update or delete, and the keys it will insert.
    To a gzip TSV per table under SNAP_DIR/<number>/ and to DS1 schema backup_release_<id>. Never into production."""
    folder = os.path.join(SNAP_DIR, number)
    os.makedirs(folder, exist_ok=True)
    schema = "backup_release_%d" % rid
    ctx.w.exec("create schema %s" % schema)
    manifest = {"number": number, "id": rid, "schema": schema, "tables": {}}
    for name, t, d in items:
        affected = sorted(d["differ"] + d["only2"])
        cols = t.insert_cols
        lines = []
        for i in range(0, len(affected), 1000):
            part = affected[i:i + 1000]
            sql = "select json_build_array(%s) as r from %s where %s" % (",".join(C.vexpr(c, t.types[c]) for c in cols), t.fq, t.key_filter(part))
            for r in ctx.prod.run(sql):
                vals = [C.float_text(v) if t.types[c] in C.FLOAT_SEND else v for c, v in zip(cols, r["r"])]
                lines.append("\t".join(tsv_cell(v) for v in vals))
        if len(lines) != len(affected):
            raise RuntimeError("snapshot of %s: expected %d rows, production returned %d" % (name, len(affected), len(lines)))
        data = "".join(x + "\n" for x in lines)
        ins = "".join("\t".join(tsv_cell(v) for v in k) + "\n" for k in sorted(d["only1"]))
        fn = name.replace(".", "_")
        write_gz(os.path.join(folder, fn + ".tsv.gz"), data)
        write_gz(os.path.join(folder, fn + ".inserted.tsv.gz"), ins)
        bt, bi = "%s.%s" % (schema, C.qi(name)), "%s.%s" % (schema, C.qi(name + "__ins"))
        ctx.w.exec("create table %s as select %s from %s with no data;\ncreate table %s as select %s from %s with no data"
                   % (bt, ",".join(C.qi(c) for c in cols), t.fq, bi, ",".join(C.qi(k) for k in t.pk), t.fq))
        if data:
            ctx.w.copy_in(bt, cols, data)
        if ins:
            ctx.w.copy_in(bi, t.pk, ins)
        manifest["tables"][name] = {"columns": cols, "pk": t.pk, "restore": len(lines), "inserted": len(d["only1"])}
    with open(os.path.join(folder, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    return schema


def ordered(ctx, names):
    """The release's tables parents first, from the foreign keys of DS1 and production together (compare.apply_order). Used for the
    inserts and upserts as given, for the deletes and the fresh-table pass reversed, and for the restore. A loop among the tables
    is refused here, which prepare calls too, so it stops before the preview and not at the apply."""
    try:
        return C.apply_order(list(names), ctx.ds1, ctx.prod)
    except C.FkCycle as e:
        raise Refused(str(e))


def referenced_tables(ctx):
    """Tables some foreign key points at (a table's own key to itself counts), on DS1 or on production, from any table. Any other
    table is "fresh" in apply_block."""
    return {p for (_, p) in C.fk_edges(ctx.ds1, ctx.prod)}


REFRESH_VIEW_SECONDS = int(os.environ.get("RELEASE_REFRESH_VIEW_SEC", "600"))   # per view; 10 minutes


def refresh_production(ctx, detail=None):
    """Refresh production's api materialized views after a change to its data was committed (migration 097): api.refresh_order()
    lists them, then api.refresh_one(view) runs for each one as its own statement under its own statement_timeout, so one slow
    view does not time out the rest and the Management API is never held for one long call. A view that fails or times out is
    recorded and the others still run. Returns "ok" or "failed: <views>" for the result. detail, a dict, receives {"views": {view:
    "ok" | "failed: <why>"}}. Without migration 097 (no api.refresh_order) it falls back to one api.refresh() call."""
    try:
        views = prod_exec(ctx.prod, "select coalesce(jsonb_agg(view_name), '[]'::jsonb) as j from api.refresh_order()", attempts=3, timeout=60)
        if not isinstance(views, list):
            raise RuntimeError("api.refresh_order answered nothing")
    except Exception as e:  # noqa: BLE001 - an older production: one call, as before
        log("api.refresh_order unavailable (%s): calling api.refresh()" % scrub(e)[:120])
        try:
            prod_exec(ctx.prod, "select api.refresh()")
            return "ok"
        except Exception as e2:  # noqa: BLE001 - recorded in the result, never hides the release outcome
            log("api.refresh failed: " + scrub(e2))
            return "failed: " + scrub(e2)[:200]
    results = {}
    for v in views:
        try:
            sql = "set statement_timeout = '%ds';\nselect api.refresh_one(%s) as j" % (REFRESH_VIEW_SECONDS, C.ql(v))
            r = prod_exec(ctx.prod, sql, attempts=1, timeout=REFRESH_VIEW_SECONDS + 60)
            if isinstance(r, dict) and r.get("status") == "failed":
                results[v] = "failed: " + str(r.get("error") or "")[:120]
            else:
                results[v] = "ok"
        except Exception as e:  # noqa: BLE001 - a timeout or a lost answer for this view only
            results[v] = "failed: " + scrub(e)[:120]
        if results[v] != "ok":
            log("refresh of %s %s" % (v, results[v]))
    if detail is not None:
        detail["views"] = results
    bad = [v for v, r in results.items() if r != "ok"]
    return "ok" if not bad else "failed: " + ", ".join(bad)


def verify_equal(ctx, name, t, want_buckets):
    n = C.count_rows(ctx.prod, t)
    return C.bucket_pass(ctx.prod, t, n) == want_buckets


# ---------------------------------------------------------------------------------------------------- automatic approval

def short(ids, n=5):
    ids = [str(i) for i in ids]
    return ", ".join(ids[:n]) + (" and %d more" % (len(ids) - n) if len(ids) > n else "")


def issue_update_reasons(ctx, t, keys, game_keys):
    """Updates to existing meta.data_issue rows are allowed only for resolution and resolved_at (resolving or re-opening) of an
    issue from AUTO_ISSUE_SOURCE about a game in this release (game_keys: their source keys). Returns the reasons for the rest."""
    if not keys:
        return []
    if len(keys) > AUTO_MAX_SIDE_ROWS:
        return ["meta.data_issue: %d rows would change (the limit is %d)" % (len(keys), AUTO_MAX_SIDE_ROWS)]
    ids_ = []
    for side in (ctx.ds1, ctx.prod):
        r = side.run("select source_id from meta.source where code = %s" % C.ql(AUTO_ISSUE_SOURCE))
        ids_.append(str(r[0]["source_id"]) if r else None)
    sid1, sid2 = ids_
    a, b = C.fetch_rows(ctx.ds1, t, keys), C.fetch_rows(ctx.prod, t, keys)
    causes = {}
    for k in sorted(keys):
        ra, rb = a.get(k), b.get(k)
        if ra is None or rb is None:
            causes.setdefault("it could not be read on both sides", []).append(k[0])
            continue
        for c in t.common:
            if ra.get(c) != rb.get(c) and c not in AUTO_ISSUE_COLUMNS:
                causes.setdefault("column %s changes; only resolution and resolved_at may" % c, []).append(k[0])
        if sid1 is None or ra.get("source_id") != sid1 or rb.get("source_id") != sid2:
            causes.setdefault("the source is not %s" % AUTO_ISSUE_SOURCE, []).append(k[0])
        if ra.get("entity_kind") != "game" or rb.get("entity_kind") != "game":
            causes.setdefault("it is not about a game", []).append(k[0])
        elif ra.get("entity_key") not in game_keys:
            causes.setdefault("its game is not one of the games that change", []).append(k[0])
    return ["meta.data_issue: %d rows would change: %s (data_issue_id %s)" % (len(ids), why, short(ids))
            for why, ids in sorted(causes.items())]


def policy_reasons(ctx, names, diffs):
    """Why a daily_scores release may NOT be approved automatically; an empty list means it meets the policy.
    The policy: only core.game, meta.verification and meta.data_issue; games change only in status, score, overtime,
    shootout and the scheduled start (and updated_at), only games that are not final in production, no inserts, no deletes, at most 500
    games; verification and data issue rows are inserts only and only about those games, except that an existing
    wikipedia_daily data issue about one of those games may change its resolution and resolved_at."""
    why = []
    outside = [n for n in names if n not in AUTO_TABLES]
    if outside:
        why.append("tables outside the policy: " + ", ".join(outside))
    if "core.game" not in names:
        why.append("core.game is not in the release")
    for n in names:
        if n in AUTO_TABLES and n not in diffs:
            why.append("%s could not be compared" % n)
    games = {}
    if "core.game" in diffs:
        t, d = diffs["core.game"]
        if d["only1"]:
            why.append("%d new games would be inserted (only updates are allowed)" % len(d["only1"]))
        if d["only2"]:
            why.append("%d games would be deleted" % len(d["only2"]))
        if len(d["differ"]) > AUTO_MAX_GAMES:
            why.append("%d games change (the limit is %d)" % (len(d["differ"]), AUTO_MAX_GAMES))
        elif d["differ"]:
            a, b = C.fetch_rows(ctx.ds1, t, d["differ"]), C.fetch_rows(ctx.prod, t, d["differ"])
            final, other = [], {}
            for k in sorted(d["differ"]):
                ra, rb = a.get(k), b.get(k)
                if ra is None or rb is None:
                    why.append("game %s could not be read on both sides" % k[0])
                    continue
                games[k[0]] = ra.get("source_key")
                if rb.get("status") == "final":
                    final.append(k[0])
                for c in t.common:
                    if ra.get(c) != rb.get(c) and c not in AUTO_GAME_COLUMNS:
                        other.setdefault(c, []).append(k[0])
            if final:
                why.append("%d games are already final in production (game ids %s)" % (len(final), short(final)))
            for c, ids in sorted(other.items()):
                why.append("column %s changes on %d games (game ids %s); only status, scores, overtime, shootout and the scheduled start may change"
                           % (c, len(ids), short(ids)))
    for name, kind, field, allowed in (("meta.verification", "entity_kind", "entity_id", set(games)),
                                       ("meta.data_issue", "entity_kind", "entity_key", {v for v in games.values() if v})):
        if name not in diffs:
            continue
        t, d = diffs[name]
        if name == "meta.data_issue":
            if d["only2"]:
                why.append("%s: %d rows would be removed (only new rows are allowed)" % (name, len(d["only2"])))
            why += issue_update_reasons(ctx, t, d["differ"], allowed)
        elif d["only2"] or d["differ"]:
            why.append("%s: %d rows would change or be removed (only new rows are allowed)" % (name, len(d["only2"]) + len(d["differ"])))
        if len(d["only1"]) > AUTO_MAX_SIDE_ROWS:
            why.append("%s: %d new rows (the limit is %d)" % (name, len(d["only1"]), AUTO_MAX_SIDE_ROWS))
        elif d["only1"]:
            rows = C.fetch_rows(ctx.ds1, t, d["only1"])
            bad = [r for r in rows.values() if not (r.get(kind) == "game" and r.get(field) in allowed)]
            if bad or len(rows) != len(d["only1"]):
                why.append("%s: %d new rows are not about the games that change" % (name, len(bad) + len(d["only1"]) - len(rows)))
    return why


def auto_review(ctx, names, diffs, preview):
    reasons = ["blocked: " + b for b in preview["blockers"]] + policy_reasons(ctx, names, diffs)
    games = len(diffs["core.game"][1]["differ"]) if "core.game" in diffs else 0
    return {"policy": "daily_scores", "eligible": not reasons, "reasons": reasons, "games": games,
            "hold_minutes": AUTO_HOLD_MINUTES, "checked_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")}


def auto_gate(ctx, rel):
    """The policy now, on the live data: checks, comparison, unchanged since the preview, and the policy itself.
    Returns (reasons, pre); no reasons means the release may be approved or applied automatically."""
    if rel["kind"] != "daily_scores":
        return ["only a daily_scores release can be approved automatically"], None
    names = list(rel["tables"])
    checks = run_checks(ctx.ds1)
    diffs, blockers, warnings = diff_tables(ctx, names)
    now = build_preview(ctx, names, False, diffs, blockers, warnings)
    now["blockers"] = check_blockers(checks) + now["blockers"]
    reasons = ["blocked: " + b for b in now["blockers"]]
    pv = rel["preview"] or {}
    for n in names:
        a, b = (pv.get("tables") or {}).get(n) or {}, now["tables"].get(n) or {}
        if (a.get("ds1_fp"), a.get("prod_fp")) != (b.get("ds1_fp"), b.get("prod_fp")):
            reasons.append("%s changed since the preview (DS1 or production moved): prepare the release again" % n)
    reasons += policy_reasons(ctx, names, diffs)
    return reasons, (diffs, now)


def read_flag(ctx):
    """The global auto-approval switch on production. Raises when it cannot be read, and callers then do nothing."""
    rows = ctx.prod.run("select paused, paused_at, paused_by, reason from meta.auto_approval")
    if len(rows) != 1:
        raise RuntimeError("meta.auto_approval has %d rows" % len(rows))
    return rows[0]


def mirror_flag(ctx, flag):
    try:
        ctx.w.exec("update meta.auto_approval set paused = %s, paused_at = %s, paused_by = %s, reason = %s"
                   % (lit(flag["paused"]), lit(flag["paused_at"]), lit(flag["paused_by"]), lit(flag["reason"])))
    except Exception as e:  # noqa: BLE001 - the mirror is only a record
        log("could not mirror the auto-approval switch on DS1: " + scrub(e))


def pause_auto(ctx, reason):
    """Hold every automatic approval, as 'system'. Keeps the first reason when already paused."""
    reason = scrub(reason)[:290]
    log("pausing automatic approvals: " + reason)
    sql = ("with u as (update meta.auto_approval set paused = true, paused_at = now(), paused_by = 'system', reason = %s "
           "where id and not paused returning 1) select count(*) as j from u" % C.ql(reason))
    try:
        prod_exec(ctx.prod, sql)
    except Exception as e:  # noqa: BLE001 - never hide the failure that caused the pause
        log("COULD NOT PAUSE AUTOMATIC APPROVALS on production: " + scrub(e))
        return
    try:
        mirror_flag(ctx, read_flag(ctx))
    except Exception as e:  # noqa: BLE001
        log("could not read the switch back: " + scrub(e))


def mark_not_auto(ctx, rel, reasons):
    pv = dict(rel["preview"] or {})
    pv["auto"] = dict(pv.get("auto") or {}, eligible=False, reasons=reasons,
                      checked_at=datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))
    set_release(ctx, rel["id"], {"preview": pv}, from_status="pending")
    log("release %s is not auto-approved: %s" % (rel["number"], "; ".join(reasons)[:400]))


def is_auto(approved_by):
    return str(approved_by or "").lower().startswith("auto:")


def is_gated(approved_by):
    """Approved by the runner's policy (auto:) or by an admin's score update request (request:): both are re-checked against
    the policy and the Hold switch right before the apply, and a failure of either pauses automatic approvals."""
    return str(approved_by or "").lower().startswith(("auto:", REQUEST_PREFIX))


def gated_actor_ok(approved_by, kind):
    """Only daily_scores can be approved this way, as exactly AUTO_ACTOR or as request:<an admin>."""
    if kind != "daily_scores":
        return False
    return approved_by == AUTO_ACTOR or (str(approved_by).startswith(REQUEST_PREFIX) and len(str(approved_by)) > len(REQUEST_PREFIX))


def same_release(p, mine):
    return (p["digest"] == mine["digest"] and p["kind"] == mine["kind"] and sorted(p["tables"]) == sorted(mine["tables"])
            and (p["options"] or {}) == (mine["options"] or {}))


def auto_pass(ctx):
    """Approve, as AUTO_ACTOR, the oldest pending daily_scores release that meets the policy now, is flagged eligible, was
    not held by John, is older than the hold, and while automatic approvals are not paused. One release per run: the next
    one is checked against the data after the first has been applied. The site never does this."""
    flag = read_flag(ctx)
    mirror_flag(ctx, flag)
    if flag["paused"]:
        log("automatic approvals are paused since %s by %s (%s)" % (flag["paused_at"], flag["paused_by"], flag["reason"]))
        return
    for mine in ctx.ds1.run("select * from meta.data_release where status = 'pending' and kind = 'daily_scores' "
                            "and (preview #>> '{auto,eligible}') = 'true' order by id"):
        p = ctx.prod.run("select id, number, kind, status, digest, tables, options, held_at, "
                         "(created_at + interval '%d minutes' <= now()) as due from meta.data_release where id = %d"
                         % (AUTO_HOLD_MINUTES, mine["id"]))
        if not p or p[0]["status"] != "pending" or p[0]["held_at"] or not p[0]["due"]:
            continue
        if not same_release(p[0], mine) or digest_check(mine) is False:
            log("release %s: production's copy does not match DS1's copy: not auto-approving" % mine["number"])
            continue
        reasons, _ = auto_gate(ctx, mine)
        if reasons:
            mark_not_auto(ctx, mine, reasons)
            continue
        guard = "held_at is null and digest = %s and (select paused is false from meta.auto_approval)" % C.ql(mine["digest"])
        if prod_exec(ctx.prod, update_sql(mine["id"], {"status": "approved", "approved_by": AUTO_ACTOR, "approved_at": "NOW"}, "pending", guard)):
            log("release %s approved automatically (%s)" % (mine["number"], AUTO_ACTOR))
            return


def row_hashes(side, t, keys):
    """{key tuple: row hash} for the given keys, hashed as compare.py does."""
    kj = "json_build_array(%s)" % ",".join(C.cexpr(k, t.types[k]) for k in t.pk)
    h = "md5(row(%s)::text)" % ",".join(C.cexpr(c, t.types[c]) for c in t.common)
    out = {}
    keys = sorted(keys)
    for i in range(0, len(keys), 500):
        for r in side.run("select %s as k, %s as h from %s where %s" % (kj, h, t.src(side), t.key_filter(keys[i:i + 500]))):
            out[tuple(r["k"])] = r["h"]
    return out


def auto_drift_mismatch(ctx, diffs):
    """Rows an automatic release wrote that production no longer holds as written, found by the drift comparison.
    DS1 moving ahead of production is not a mismatch: production still holds what the release wrote."""
    touched = {}
    for r in ctx.ds1.run("select number, result from meta.data_release where kind = 'daily_scores' and status = 'done' "
                         "and (approved_by like 'auto:%%' or approved_by like 'request:%%') and finished_at > now() - interval '%d days' order by id" % AUTO_DRIFT_DAYS):
        for tbl, m in ((r["result"] or {}).get("touched") or {}).items():
            for ks, h in m.items():
                touched[(tbl, tuple(json.loads(ks)))] = (r["number"], h)
    bad = []
    for n, (t, d) in diffs.items():
        drifting = set(d["only1"]) | set(d["only2"]) | set(d["differ"])
        keys = [k for (tbl, k) in touched if tbl == n and k in drifting]
        if not keys:
            continue
        now = row_hashes(ctx.prod, t, keys)
        bad += [(touched[(n, k)][0], n, k) for k in keys if now.get(k) != touched[(n, k)][1]]
    return bad


# ---------------------------------------------------------------------------------------------------- run: publish

def publish_plan(ctx, items):
    """The stage_and_apply plan for a publish: items [(name, Table, diff)] in parents-first order. A table nothing references is
    "fresh" (apply_block deletes its removals and the rows it writes before inserting)."""
    plan = []
    referenced = referenced_tables(ctx)
    for n, t, d in items:
        ups = list(d["only1"]) + list(d["differ"])
        plan.append({"t": t, "ups": read_tuples(ctx.ds1, t, ups) if ups else None,
                     "dels": d["only2"], "expected": d["ds1"], "fresh": n not in referenced})
    return plan


def run_publish(ctx, rel, pre=None):
    """pre: (diffs, now) from auto_gate, which has just done the checks and the comparison below on the same data."""
    started = time.time()
    names = list(rel["tables"])
    options = rel["options"] or {}
    replace = bool(options.get("replace"))
    pv = rel["preview"]
    if pre:
        diffs, now = pre
    else:
        checks = run_checks(ctx.ds1)
        problems = check_blockers(checks)
        if problems:
            raise Refused("checks fail now: " + "; ".join(problems))
        diffs, blockers, warnings = diff_tables(ctx, names)
        for n in names:
            if blockers[n]:
                raise Refused("%s: %s" % (n, "; ".join(blockers[n])))
        now = build_preview(ctx, names, replace, diffs, blockers, warnings)
        for n in names:
            a, b = pv["tables"][n], now["tables"][n]
            if (a["ds1_fp"], a["prod_fp"]) != (b["ds1_fp"], b["prod_fp"]):
                raise Refused("%s changed since the preview (DS1 or production moved): prepare the release again" % n)
        if now["blockers"]:
            raise Refused("; ".join(now["blockers"]))

    order = ordered(ctx, names)
    items = [(n, diffs[n][0], diffs[n][1]) for n in order]
    schema = snapshot(ctx, rel["id"], rel["number"], items)
    before_fp = {n: now["tables"][n]["prod_fp"] for n in names}

    try:
        stage_and_apply(ctx, rel["id"], publish_plan(ctx, items))
    except Exception as e:
        # the DO block is atomic; if the answer was lost, production may still have committed: look before calling it a failure
        if all(verify_equal(ctx, n, t, d["b1"]) for n, t, d in items):
            log("the answer was lost but production matches DS1: counting the release as applied (%s)" % scrub(e))
        else:
            raise
    problem = None
    try:
        for n, t, d in items:
            if not verify_equal(ctx, n, t, d["b1"]):
                log("verification failed for %s: restoring the snapshot" % n)
                try:
                    restore(ctx, rel["id"], names, before_fp=before_fp, orig_rows={x: now["tables"][x]["prod_rows"] for x in names})
                except Exception as e2:  # noqa: BLE001
                    raise RuntimeError("production does not match DS1 after the release for %s and the automatic restore failed: %s" % (n, scrub(e2)))
                raise RuntimeError("production did not match DS1 after the release for %s; the snapshot was restored" % n)
    except Exception as e:  # noqa: BLE001 - the apply committed, so the views must be refreshed whatever went wrong
        problem = e
    views = {}
    refresh = refresh_production(ctx, views)
    if problem:
        raise AfterCommit(scrub(problem), dict({"refresh": refresh, "verified": False, "backup_schema": schema}, **views))
    result = {"tables": {n: {"add": now["tables"][n]["add"], "change": now["tables"][n]["change"], "remove": now["tables"][n]["remove"],
                             "rows_before": now["tables"][n]["prod_rows"], "rows_after": now["tables"][n]["ds1_rows"]} for n in names},
              "totals": {k: now["totals"][k] for k in ("add", "change", "remove")},
              "backup_schema": schema, "before_fp": before_fp, "verified": True, "refresh": refresh,
              "seconds": round(time.time() - started)}
    result.update(views)
    if rel["kind"] == "daily_scores":
        result["leagues"] = touched_leagues(ctx, items)
        result["touched"] = {}
        for n, t, d in items:
            keys = list(d["only1"]) + list(d["differ"])
            result["touched"][n] = {json.dumps(list(k)): h for k, h in row_hashes(ctx.prod, t, keys).items()}
    return result


# ---------------------------------------------------------------------------------------------------- run: ds1_step

def run_step_release(ctx, rel):
    started = time.time()
    path, sha = rel["options"]["file"], rel["git_sha"]
    if not STEP_FILE_RE.match(path):
        raise Refused("bad file name")
    content = file_at(sha, path)
    if hashlib.sha256(content).hexdigest() != rel["preview"]["file_sha256"]:
        raise Refused("%s at %s is not the file that was previewed" % (path, sha[:10]))
    body = clean_step_sql(content.decode())
    checks = run_checks(ctx.ds1)
    problems = check_blockers(checks)
    if problems:
        raise Refused("checks fail now: " + "; ".join(problems))
    res = run_step(ctx, body, checks, commit=True)
    if res.get("error"):
        raise RuntimeError(res["error"])
    if res.get("result") != "committed":
        raise Refused("the file makes a check worse on DS1; nothing was changed")
    return {"file": path, "git_sha": sha, "before": res.get("before"), "after": res.get("after"), "seconds": round(time.time() - started)}


# ---------------------------------------------------------------------------------------------------- rollback

def later_releases(ctx, orig):
    return ctx.ds1.run("select number from meta.data_release where id > %d and status = 'done' and kind in ('publish', 'rollback', 'daily_scores') "
                       "and tables && %s order by id" % (orig["id"], text_array(orig["tables"])))


def prepare_rollback(ctx, number, title=None, notes=None, ticket=None):
    r = ctx.ds1.run("select * from meta.data_release where number = %s" % C.ql(number))
    if not r:
        raise Refused("no release %s" % number)
    orig = r[0]
    blockers = []
    if orig["kind"] not in PUBLISH_KINDS or orig["status"] != "done":
        blockers.append("only a finished publish release can be rolled back")
    later = later_releases(ctx, orig) if not blockers else []
    if later:
        blockers.append("later releases changed the same tables: %s; roll those back first" % ", ".join(x["number"] for x in later))
    res = orig.get("result") or {}
    if not blockers and not res.get("backup_schema"):
        blockers.append("release %s has no snapshot" % number)
    per = {}
    for n, v in ((res.get("tables") or {}).items()):
        per[n] = {"ds1_rows": None, "prod_rows": v["rows_after"], "add": v["remove"] + v["change"], "change": 0, "remove": v["add"],
                  "bytes_delta": 0, "ds1_fp": None, "prod_fp": (res.get("before_fp") or {}).get(n), "blockers": [], "warnings": []}
    preview = {"tables": per, "blockers": blockers, "warnings": [], "rollback_of": number,
               "totals": {k: sum(p[k] for p in per.values()) for k in ("add", "change", "remove", "bytes_delta")}}
    options = {"rollback_of": number}
    row = {"kind": "rollback", "title": title or "Roll back %s" % number, "notes": notes, "ticket": ticket, "tables": orig["tables"],
           "options": options, "status": "pending", "preview": preview, "git_sha": head_sha(),
           "digest": digest_of("rollback", orig["tables"], options, head_sha(), preview)}
    row["digest"] = hashlib.sha256((row["digest"] + orig["digest"]).encode()).hexdigest()
    row = create_release(ctx, row)
    print_preview(row)
    return row


def restore(ctx, rid, names, before_fp=None, orig_rows=None):
    """Put production back from the snapshot of release id <rid>: restore updated and deleted rows, remove inserted ones."""
    schema = "backup_release_%d" % rid
    tabs = load_tables(ctx, names)
    plan = []
    order = ordered(ctx, names)
    referenced = referenced_tables(ctx)
    for n in order:
        t, bl, _ = tabs[n]
        if t is None or bl:
            raise Refused("%s: %s" % (n, "; ".join(bl)))
        bt, bi = "%s.%s" % (schema, C.qi(n)), "%s.%s" % (schema, C.qi(n + "__ins"))
        cnt = ctx.ds1.run("select (select count(*) from %s) as r, (select count(*) from %s) as i" % (bt, bi))[0]
        keys = [tuple(r["k"]) for r in ctx.ds1.run("select json_build_array(%s) as k from %s" % (",".join(C.cexpr(k, t.types[k]) for k in t.pk), bi))]
        now_rows = C.count_rows(ctx.prod, t)
        plan.append({"t": t, "ups": read_all_tuples(ctx.ds1, t, bt) if cnt["r"] else None, "dels": keys,
                     "expected": (orig_rows or {}).get(n, now_rows), "_n": n,
                     "fresh": n not in referenced})
    stage_and_apply(ctx, rid * 1000 + 1, plan)
    if before_fp:
        for p in plan:
            t = p["t"]
            n2 = C.count_rows(ctx.prod, t)
            if fp(C.bucket_pass(ctx.prod, t, n2)) != before_fp[p["_n"]]:
                raise AfterCommit("after the restore %s does not match its state before the release" % p["_n"])


def run_rollback(ctx, rel):
    started = time.time()
    number = rel["options"]["rollback_of"]
    orig = ctx.ds1.run("select * from meta.data_release where number = %s" % C.ql(number))[0]
    if orig["kind"] not in PUBLISH_KINDS or orig["status"] != "done":
        raise Refused("release %s is not a finished publish release" % number)
    later = later_releases(ctx, orig)
    if later:
        raise Refused("later releases changed the same tables: " + ", ".join(x["number"] for x in later))
    res = orig["result"]
    names = list(orig["tables"])
    try:
        restore(ctx, orig["id"], names, before_fp=res["before_fp"],
                orig_rows={n: v["rows_before"] for n, v in res["tables"].items()})
    except AfterCommit as e:
        views = {}
        raise AfterCommit(str(e), dict({"refresh": refresh_production(ctx, views), "verified": False}, **views))
    views = {}
    refresh = refresh_production(ctx, views)
    set_release(ctx, orig["id"], {"status": "rolled_back"}, from_status="done")
    return dict({"rolled_back": number, "verified": True, "refresh": refresh, "seconds": round(time.time() - started)}, **views)


# ---------------------------------------------------------------------------------------------------- score update requests

def finish_request(ctx, rid, status, summary, release_number=None):
    """Write the end state of a request on production. Only a queued or running row can be finished."""
    sets = "status = %s, finished_at = now(), summary = %s, release_number = %s" % (
        C.ql(status), C.ql(scrub(summary)[:500]), C.ql(release_number) if release_number else "null")
    prod_exec(ctx.prod, "with u as (update meta.score_update_request set %s where id = %d and status in ('queued', 'running') "
                        "returning 1) select count(*) as j from u" % (sets, rid))
    log("score update request %d: %s: %s" % (rid, status, scrub(summary)[:200]))


def daily_running(ctx):
    """True when the daily job's heartbeat (ingest.daily_run, migration 048) shows a run that started lately and has not ended."""
    try:
        return ctx.ds1.run("select count(*) as n from ingest.daily_run where outcome = 'running' "
                           "and started_at > now() - interval '%d minutes'" % HEARTBEAT_MINUTES)[0]["n"] > 0
    except Exception as e:  # noqa: BLE001 - no heartbeat table yet: there is nothing to wait for
        log("could not read the daily job's heartbeat (%s): going on" % scrub(e)[:120])
        return False


def run_daily_job(ctx):
    """Run scripts/daily/run.py --apply against DS1 with the runner's environment. Its release hook is switched on here (the same
    hook the scheduled job uses), so it prepares the release. Returns (exit code, output)."""
    cache = os.environ.get("RELEASE_DAILY_CACHE") or os.path.join(os.path.dirname(SNAP_DIR.rstrip("/")), "daily")
    for d in ("raw", "logs"):
        os.makedirs(os.path.join(cache, d), exist_ok=True)
    env = dict(os.environ, DAILY_PREPARE_RELEASE="1", DAILY_RELEASE_KIND="daily_scores", SPX_DAILY_CACHE=cache)
    cmd = [sys.executable, "-I", ctx.daily_script, "--apply", "--state", os.path.join(cache, "state.json"),
           "--raw-dir", os.path.join(cache, "raw"), "--log-dir", os.path.join(cache, "logs")]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=DAILY_TIMEOUT, env=env)
    except subprocess.TimeoutExpired:
        return 124, "the scores job ran longer than %d seconds and was stopped" % DAILY_TIMEOUT
    return r.returncode, scrub(r.stdout + "\n" + r.stderr)


def approve_for_request(ctx, rel, who):
    """The admin's click counts as the approval of the release the request prepared, but the policy and the Hold switch still
    apply, exactly as for an automatic approval. Returns (approved, why not)."""
    if rel["kind"] != "daily_scores":
        return False, "it changes more than scores, so it needs your review"
    flag = read_flag(ctx)
    mirror_flag(ctx, flag)
    if flag["paused"]:
        return False, "auto-approvals are on hold, so it waits for you"
    p = ctx.prod.run("select id, number, kind, status, digest, tables, options, held_at from meta.data_release where id = %d" % rel["id"])
    if not p or p[0]["status"] != "pending" or p[0]["held_at"] or not same_release(p[0], rel) or digest_check(rel) is False:
        return False, "production's copy does not match, so it waits for you"
    reasons, _ = auto_gate(ctx, rel)
    if reasons:
        mark_not_auto(ctx, rel, reasons)
        return False, "it does not meet the auto-approval policy (%s), so it waits for you" % reasons[0][:160]
    guard = "held_at is null and digest = %s and (select paused is false from meta.auto_approval)" % C.ql(rel["digest"])
    if prod_exec(ctx.prod, update_sql(rel["id"], {"status": "approved", "approved_by": REQUEST_PREFIX + who, "approved_at": "NOW"}, "pending", guard)):
        return True, ""
    return False, "it could not be approved just now, so it waits for you"


def drift_request(ctx, req):
    """A "Check now" request: run the drift check here and now (the runner holds the run lock) and say what it found."""
    if not prod_exec(ctx.prod, "with u as (update meta.score_update_request set status = 'running', started_at = now() "
                               "where id = %d and status = 'queued' returning 1) select count(*) as j from u" % req["id"]):
        return
    log("drift check requested by %s (request %d)" % (req["requested_by"], req["id"]))
    try:
        code, summary, number = run_drift(ctx)
        finish_request(ctx, req["id"], "done", summary, number)
    except Exception as e:  # noqa: BLE001 - the request must not stay running
        finish_request(ctx, req["id"], "failed", "The drift check failed: %s" % scrub(e)[:200])


def request_pass(ctx):
    """Handle the oldest queued score update request: run the daily scores job on DS1, prepare the release, approve it as
    request:<admin> if the policy and the Hold switch allow, and write the status and a short summary on the request row.
    Runs inside cmd_run, so it shares the run lock; the DS1 lock keeps it from overlapping the scheduled daily job."""
    rows = ctx.prod.run("select id, requested_by, status, kind from meta.score_update_request where status in ('queued', 'running') order by id")
    for r in rows:
        if r["status"] == "running":  # this runner holds the run lock, so nobody is running it: the runner stopped
            finish_request(ctx, r["id"], "failed", "The runner stopped while this was running. Try again.")
    queued = [r for r in rows if r["status"] == "queued"]
    if not queued:
        return
    req = queued[0]
    who = str(req["requested_by"]).strip()
    if not who or len(who) > 80 or re.match(r"(?i)^(auto:|request:|system$)", who):
        finish_request(ctx, req["id"], "failed", "The request had no valid requester, so it was not run.")
        return
    if req["kind"] == "drift":
        return drift_request(ctx, req)
    lock = daily_lock.Lock(ctx.ds1_dsn)
    if not lock.try_acquire():
        log("score update request %d: the scores job holds the lock; it stays queued" % req["id"])
        return
    try:
        if daily_running(ctx):
            log("score update request %d: the daily job is running now; it stays queued" % req["id"])
            return
        open_rel = ctx.prod.run("select number, status from meta.data_release where kind = 'daily_scores' "
                                "and status in ('pending', 'approved', 'running') order by id limit 1")
        if open_rel:
            finish_request(ctx, req["id"], "done", "Release %s (daily scores) is already %s. No new update was started; decide that one first."
                           % (open_rel[0]["number"], open_rel[0]["status"]), open_rel[0]["number"])
            return
        if not prod_exec(ctx.prod, "with u as (update meta.score_update_request set status = 'running', started_at = now() "
                                   "where id = %d and status = 'queued' returning 1) select count(*) as j from u" % req["id"]):
            return
        log("score update request %d from %s: running the scores job" % (req["id"], who))
        before = ctx.ds1.run("select coalesce(max(id), 0) as m from meta.data_release")[0]["m"]
        code, out = run_daily_job(ctx)
        for line in out.strip().splitlines()[-6:]:
            log("scores job: " + line[:300])
        if code != 0:
            finish_request(ctx, req["id"], "failed", "The scores job did not finish (exit %d). Nothing was published. Details are in the runner log." % code)
            return
        made = ctx.ds1.run("select * from meta.data_release where id > %d and created_by = 'daily-job' and status = 'pending' order by id" % before)
        hook = re.findall(r"release hook: (\w+):", out)
        if not made:
            if hook and hook[-1] != "nothing":
                finish_request(ctx, req["id"], "failed", "Scores were updated on DS1 but the release could not be prepared (%s). Details are in the runner log." % hook[-1])
            else:
                finish_request(ctx, req["id"], "nothing", "Nothing new: DS1 and production already agree. Wikipedia often updates hours after games end, so try again later.")
            return
        rel = made[0]
        games = ((rel["preview"] or {}).get("auto") or {}).get("games") or 0
        approved, why = approve_for_request(ctx, rel, who)
        if approved:
            finish_request(ctx, req["id"], "done", "Release %s approved by your request (%s). It is applied within a minute."
                           % (rel["number"], "%d games" % games if games else "scores"), rel["number"])
        else:
            finish_request(ctx, req["id"], "done", "Release %s was prepared, but %s." % (rel["number"], why), rel["number"])
    except Exception as e:  # noqa: BLE001 - the request must not stay running
        try:
            finish_request(ctx, req["id"], "failed", "The update failed: %s" % scrub(e)[:200])
        except Exception as e2:  # noqa: BLE001
            log("could not record the failure of request %d: %s" % (req["id"], scrub(e2)))
    finally:
        lock.release()


# ---------------------------------------------------------------------------------------------------- refresh the site's cache

def dependent_views(ctx, tables):
    """The views in schema api that read the given tables, directly or through other views, from DS1's catalog."""
    rows = ctx.ds1.run("""
        with recursive deps(oid) as (
          select c.oid from pg_class c where c.relnamespace::regnamespace::text || '.' || c.relname = any(%s)
          union
          select r.ev_class from deps d
            join pg_depend dp on dp.refobjid = d.oid and dp.classid = 'pg_rewrite'::regclass
            join pg_rewrite r on r.oid = dp.objid and r.ev_class <> d.oid)
        select c.relname as v from deps d join pg_class c on c.oid = d.oid
        where c.relnamespace = 'api'::regnamespace and c.relkind in ('v', 'm') order by 1""" % text_array(tables))
    return [r["v"] for r in rows]


def touched_leagues(ctx, items):
    """Leagues (lower case) of the games a daily_scores release changes, or None when that cannot be said."""
    try:
        game = [d for n, t, d in items if n == "core.game"]
        if not game or game[0]["only2"]:
            return None
        ids = sorted({int(k[0]) for k in list(game[0]["only1"]) + list(game[0]["differ"])})
        found = set()
        for i in range(0, len(ids), 1000):
            found |= {r["l"] for r in ctx.ds1.run("select distinct lower(league) as l from api.games where game_id in (%s)"
                                                  % ",".join(str(x) for x in ids[i:i + 1000]))}
        return sorted(found) or None
    except Exception as e:  # noqa: BLE001 - without leagues the whole view is refreshed, which is only broader
        log("could not tell which leagues changed: " + scrub(e)[:120])
        return None


TAG_RE = re.compile(r"^[a-z0-9_:.-]{1,100}$")


def revalidate_tags(ctx, tables, leagues):
    """The cache tags of the site's fetches (web/src/lib/api/client.ts): api:<view>, and api:<view>:<league> or api:<view>:all."""
    try:
        views = dependent_views(ctx, tables)
    except Exception as e:  # noqa: BLE001
        log("could not list the views that read %s (%s): refreshing every api tag" % (",".join(tables), scrub(e)[:120]))
        views = []
    tags = ["data-version"]
    if not views:
        return tags + ["api"]
    for v in views:
        if leagues:
            tags += ["api:%s:%s" % (v, x) for x in list(leagues) + ["all"]]
        else:
            tags.append("api:" + v)
    tags = [t for t in dict.fromkeys(tags) if TAG_RE.match(t)]
    if len(tags) > REVALIDATE_MAX_TAGS:
        tags = ["data-version"] + ["api:" + v for v in views]
    return tags


def revalidate_site(ctx, tables, leagues):
    """After a release changed production: ONE request to the site's secret-protected POST route, so the changed pages are rebuilt
    now instead of within the hour. Never changes the release outcome. Returns "ok (<n> tags)", "off" or "failed: <why>"."""
    url, secret = os.environ.get("REVALIDATE_URL", "").strip(), os.environ.get("REVALIDATE_SECRET", "").strip()
    if not url or not secret:
        log("REVALIDATE_URL / REVALIDATE_SECRET not set: the site refreshes within the hour")
        return "off"
    parts = urllib.parse.urlsplit(url)
    if parts.scheme != "https" and not (parts.scheme == "http" and parts.hostname in ("127.0.0.1", "localhost")):
        return "failed: REVALIDATE_URL must be https"
    try:
        tags = revalidate_tags(ctx, tables, leagues)
        req = urllib.request.Request(url, data=json.dumps({"tags": tags}).encode(), method="POST",
                                     headers={"Authorization": "Bearer " + secret, "Content-Type": "application/json",
                                              "User-Agent": "spx-stats-release-runner/1"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            resp.read()
        log("site cache refresh requested (%d tags)" % len(tags))
        return "ok (%d tags)" % len(tags)
    except Exception as e:  # noqa: BLE001 - the pages refresh within the hour anyway
        log("site cache refresh failed: " + scrub(e)[:200])
        return "failed: " + scrub(e)[:200]


# ---------------------------------------------------------------------------------------------------- run loop

def cmd_run(ctx, args):
    os.makedirs(SNAP_DIR, exist_ok=True)
    lock = open(os.path.join(SNAP_DIR, ".run.lock"), "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        log("another run is in progress")
        return 0
    stale = ctx.ds1.run("select id, number, approved_by from meta.data_release where status = 'running'")
    for r in stale:
        log("release id %d was left running by a runner that stopped: marking it failed" % r["id"])
        set_release(ctx, r["id"], {"status": "failed", "finished_at": "NOW",
                                   "error": "The runner stopped while this release was running. Check production with the drift report."})
        if is_gated(r["approved_by"]):
            pause_auto(ctx, "Automatic release %s was left running by a runner that stopped." % r["number"])
    try:
        request_pass(ctx)
    except Exception as e:  # noqa: BLE001 - a missing migration or a network error must not stop the manual releases
        log("score update request step skipped: " + scrub(e))
    try:
        auto_pass(ctx)
    except Exception as e:  # noqa: BLE001 - a missing migration or a network error must not stop the manual releases
        log("automatic approval step skipped: " + scrub(e))
    asked = ctx.prod.run("select id, number, kind, status, digest, tables, options, approved_by, approved_at "
                         "from meta.data_release where status in ('approved', 'rejected') order by id")
    did = 0
    for p in asked:
        mine = release_by_id(ctx.ds1, p["id"])
        if mine is None or mine["number"] != p["number"]:
            log("production has release %s that DS1 does not know: refusing it" % p["number"])
            if is_gated(p["approved_by"]):
                pause_auto(ctx, "Production has an automatically approved release (%s) that DS1 never prepared." % p["number"])
            prod_exec(ctx.prod, update_sql(p["id"], {"status": "failed", "finished_at": "NOW",
                                                     "error": "DS1 has no such release; refused."}, "approved"))
            continue
        if mine["status"] != "pending":
            # DS1 already moved on (for example it finished and production could not be told): make production agree
            if p["status"] == "approved":
                set_release(ctx, mine["id"], {k: mine[k] for k in ("status", "result", "error", "finished_at") if mine.get(k) is not None})
            continue
        if p["status"] == "rejected":
            ctx.w.exec(update_sql(mine["id"], {"status": "rejected", "approved_by": p["approved_by"], "approved_at": p["approved_at"]}, "pending"))
            continue
        auto = is_gated(p["approved_by"])
        if not same_release(p, mine) or digest_check(mine) is False:
            log("release %s: production's copy does not match DS1's copy: refusing it" % p["number"])
            set_release(ctx, mine["id"], {"status": "failed", "finished_at": "NOW",
                                          "error": "The approved release does not match the copy on DS1; refused."})
            if auto:
                pause_auto(ctx, "Automatically approved release %s does not match DS1's copy." % p["number"])
            continue
        pre, guard = None, None
        if auto:
            if not gated_actor_ok(p["approved_by"], mine["kind"]):
                log("release %s: only daily_scores can be approved automatically: refusing it" % p["number"])
                set_release(ctx, mine["id"], {"status": "failed", "finished_at": "NOW",
                                              "error": "Refused: automatic approval is only for daily_scores releases."})
                pause_auto(ctx, "Release %s was approved automatically but is not a daily_scores release." % p["number"])
                continue
            try:
                flag = read_flag(ctx)
                reasons, pre = ([], None) if flag["paused"] else auto_gate(ctx, mine)
            except Exception as e:  # noqa: BLE001 - cannot tell, so do not apply; it stays approved and is looked at again
                log("release %s: could not check the automatic approval, leaving it: %s" % (p["number"], scrub(e)))
                continue
            if flag["paused"] or reasons:
                prod_exec(ctx.prod, update_sql(p["id"], {"status": "pending", "approved_by": None, "approved_at": None}, "approved",
                                               "approved_by ~ '^(auto|request):'"))
                if flag["paused"]:
                    log("release %s: automatic approvals are paused, so it goes back to pending" % p["number"])
                else:
                    mark_not_auto(ctx, mine, reasons)
                continue
            guard = "held_at is null and (select paused is false from meta.auto_approval)"
        if not prod_exec(ctx.prod, update_sql(p["id"], {"status": "running", "started_at": "NOW", "approved_by": p["approved_by"]}, "approved", guard)):
            continue
        ctx.w.exec(update_sql(mine["id"], {"status": "running", "started_at": "NOW", "approved_by": p["approved_by"],
                                           "approved_at": p["approved_at"]}))
        log("running release %s (%s): %s" % (mine["number"], mine["kind"], mine["title"]))
        try:
            handler = {"publish": run_publish, "daily_scores": run_publish, "ds1_step": run_step_release, "rollback": run_rollback}[mine["kind"]]
            result = handler(ctx, mine, pre) if mine["kind"] in PUBLISH_KINDS else handler(ctx, mine)
            if mine["kind"] != "ds1_step":
                result["revalidate"] = revalidate_site(ctx, mine["tables"], result.get("leagues"))
            result["sync_status"] = refresh_sync(ctx, mine["tables"])
            set_release(ctx, mine["id"], {"status": "done", "finished_at": "NOW", "result": result, "error": None})
            log("release %s done" % mine["number"])
        except Refused as e:
            set_release(ctx, mine["id"], {"status": "failed", "finished_at": "NOW", "error": "Refused: " + scrub(e)})
            log("release %s refused: %s" % (mine["number"], scrub(e)))
            if auto:
                pause_auto(ctx, "Automatic release %s was refused: %s" % (mine["number"], scrub(e)))
        except Exception as e:  # noqa: BLE001 - every failure is recorded
            failed = {"status": "failed", "finished_at": "NOW", "error": scrub(e)}
            if isinstance(e, AfterCommit) and e.result:
                failed["result"] = dict(e.result, revalidate=revalidate_site(ctx, mine["tables"], None), sync_status=refresh_sync(ctx, mine["tables"]))
            set_release(ctx, mine["id"], failed)
            log("release %s failed: %s" % (mine["number"], scrub(e)))
            if auto:
                pause_auto(ctx, "Automatic release %s failed: %s" % (mine["number"], scrub(e)))
        did += 1
    if not did:
        log("nothing approved")
    return 0


def digest_check(rel):
    """True when the digest matches the content of the DS1 row, so a changed preview or option is noticed."""
    if rel["kind"] == "rollback":
        return True
    return digest_of(rel["kind"], rel["tables"], rel["options"] or {}, rel["git_sha"], rel["preview"] or {}) == rel["digest"]


# ---------------------------------------------------------------------------------------------------- drift

def compare_table(ctx, c1, c2, n):
    """One table, DS1 against production -> (status row (name, ds1 rows, prod rows, state, detail), (t, d) or None, blockers)."""
    if n not in c2:
        return (n, None, None, "differs", "missing in production: run its migration there"), None, []
    if n not in c1:
        return (n, None, None, "differs", "only in production (not on DS1)"), None, []
    t = C.Table(n, c1[n], c2[n])
    bl = [x for x in t.notes if not x.startswith("columns only on production")]
    if not t.pk or bl:
        return (n, None, None, "differs", "; ".join(bl) or "no usable primary key"), None, bl
    d = C.diff_table(ctx.ds1, ctx.prod, t)
    if d["only1"] or d["only2"] or d["differ"]:
        return (n, d["ds1"], d["prod"], "differs", "only in DS1 %d, only in production %d, different %d"
                % (len(d["only1"]), len(d["only2"]), len(d["differ"]))), (t, d), []
    return (n, d["ds1"], d["prod"], "same", None), (t, d), []


def sync_sql(status, only=None):
    """SQL that writes meta.sync_status rows with the time of this comparison; replaces every row, or only the named tables."""
    rows = ",\n".join("(%s, %s, %s, %s, now(), %s)" % (C.ql(n), lit(a), lit(b), C.ql(s), lit(det)) for n, a, b, s, det in status)
    where = "" if only is None else " where table_name = any(%s)" % text_array(only)
    ins = "insert into meta.sync_status (table_name, ds1_rows, prod_rows, state, checked_at, detail) values\n%s" % rows if rows else "select 1"
    return "delete from meta.sync_status%s;\n%s" % (where, ins)


def refresh_sync(ctx, names):
    """After a release changed production (or DS1): compare just its tables again and write their rows in meta.sync_status on both
    sides, so /admin/data does not go on showing the result of an older comparison. Returns "ok" or "failed: <why>"."""
    try:
        c1, c2 = C.catalog(ctx.ds1), C.catalog(ctx.prod)
        names = sorted(n for n in set(names) if n in c1 or n in c2)
        if not names:
            return "ok"
        sql = sync_sql([compare_table(ctx, c1, c2, n)[0] for n in names], only=names)
        ctx.w.exec(sql)
        prod_exec(ctx.prod, sql)
        return "ok"
    except Exception as e:  # noqa: BLE001 - only a record; the nightly check writes it again
        log("could not refresh the sync status: " + scrub(e)[:200])
        return "failed: " + scrub(e)[:200]


def run_drift(ctx):
    """The drift check: compare every table, write meta.sync_status, pause automatic approvals if rows an automatic release wrote have
    changed, and propose one fix release. Returns (exit code, summary text, fix release number or None)."""
    c1, c2 = C.catalog(ctx.ds1), C.catalog(ctx.prod)
    names = sorted(set(c1) | set(c2))
    status, fixable = [], []
    diffs, blockers, warnings = {}, {}, {}
    for n in names:
        row, td, bl = compare_table(ctx, c1, c2, n)
        status.append(row)
        if td is None:
            if bl:
                blockers[n], warnings[n] = bl, []
            continue
        diffs[n], blockers[n], warnings[n] = td, [], []
        if row[3] == "differs":
            fixable.append(n)
        log("%-30s %s" % (n, row[3]))
    try:
        bad = auto_drift_mismatch(ctx, diffs)
        if bad:
            pause_auto(ctx, "Drift check: %d rows written by automatic releases differ in production (release %s, %s %s)"
                       % (len(bad), bad[0][0], bad[0][1], "/".join(bad[0][2])))
    except Exception as e:  # noqa: BLE001 - the drift report itself must still be written
        log("could not compare the rows automatic releases wrote: " + scrub(e))
    sql = sync_sql(status)
    ctx.w.exec(sql)
    prod_exec(ctx.prod, sql)
    differing = [r[0] for r in status if r[3] == "differs"]
    summary = "Checked %d tables: " % len(status) + ("all match." if not differing else "%d differ (%s)." % (len(differing), ", ".join(differing[:6]) + (", ..." if len(differing) > 6 else "")))
    if not fixable:
        log("drift: nothing to propose")
        return 0, summary, None
    old = ctx.ds1.run("select id from meta.data_release where status = 'pending' and created_by = 'drift'")
    for o in old:
        set_release(ctx, o["id"], {"status": "rejected", "approved_by": "drift", "approved_at": "NOW", "error": "Replaced by a newer drift proposal."})
    day = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    try:
        row = prepare_publish(ctx, "Drift fix %s" % day, fixable, notes="Proposed by the nightly drift check: %s." % ", ".join(fixable),
                              created_by="drift", diff_cache=(diffs, blockers, warnings))
        return 1, summary + " Fix release %s is waiting under Pending." % row["number"], row["number"]
    except Refused as e:
        log("drift: %s" % e)
    return 1, summary, None


def cmd_drift(ctx, args):
    return run_drift(ctx)[0]


# ---------------------------------------------------------------------------------------------------- commands

def cmd_prepare(ctx, args):
    if args.kind == "ds1_step":
        if not args.file:
            raise SystemExit("--file is required for a ds1_step")
        prepare_step(ctx, args.title, args.file, args.notes, args.ticket)
    elif args.kind == "daily_scores":
        if args.replace:
            raise SystemExit("--replace is not allowed for a daily_scores release")
        title = args.title or "Daily scores %s" % datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
        prepare_publish(ctx, title, valid_tables(args.tables or ",".join(AUTO_TABLES)), args.notes, args.ticket, kind="daily_scores")
    else:
        if not args.title:
            raise SystemExit("--title is required")
        prepare_publish(ctx, args.title, valid_tables(args.tables or ""), args.notes, args.ticket, replace=args.replace)
    return 0


def cmd_rollback(ctx, args):
    prepare_rollback(ctx, args.release, args.title, args.notes, args.ticket)
    return 0


def cmd_checks(ctx, args):
    bad = 0
    for c in run_checks(ctx.ds1):
        print("%-34s %s  rows=%d baseline=%d  %s" % (c["name"], "ok  " if c["ok"] else "FAIL", c["rows"], c["baseline"], c["what"]))
        bad += 0 if c["ok"] else 1
    return 1 if bad else 0


def cmd_status(ctx, args):
    for r in ctx.ds1.run("select number, kind, status, title, created_by, approved_by from meta.data_release order by id desc limit 30"):
        print("%-14s %-9s %-10s %s  (by %s, approved by %s)" % (r["number"], r["kind"], r["status"], r["title"], r["created_by"], r["approved_by"]))
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--project-ref", default=C.PROJECT_REF)
    ap.add_argument("--ds1-dsn", help="test only: psql connection string for DS1 instead of PG* env")
    ap.add_argument("--api-url", help="test only: a stand-in for the Management API query endpoint")
    ap.add_argument("--daily-script", help="test only: a stand-in for scripts/daily/run.py")
    ap.add_argument("--by", help="who prepared it (default release.py)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("prepare")
    p.add_argument("--title", help="required except for daily_scores (default: Daily scores <date>)")
    p.add_argument("--tables", help="comma-separated schema.table list (publish)")
    p.add_argument("--kind", choices=["publish", "ds1_step", "daily_scores"], default="publish",
                   help="daily_scores: tables default to core.game,meta.verification,meta.data_issue; approves itself when it meets the policy")
    p.add_argument("--file", help="ds1_step: db/migrations/NNN.sql or db/build/NNN.sql, committed and pushed")
    p.add_argument("--ticket")
    p.add_argument("--notes")
    p.add_argument("--replace", action="store_true", help="allow a table to shrink by more than 5 percent")
    p.set_defaults(fn=cmd_prepare)
    p = sub.add_parser("run")
    p.set_defaults(fn=cmd_run)
    p = sub.add_parser("rollback")
    p.add_argument("--release", required=True, help="the number of the release to undo, e.g. 2026.10.12-1")
    p.add_argument("--title")
    p.add_argument("--ticket")
    p.add_argument("--notes")
    p.set_defaults(fn=cmd_rollback)
    p = sub.add_parser("drift")
    p.set_defaults(fn=cmd_drift)
    p = sub.add_parser("checks")
    p.set_defaults(fn=cmd_checks)
    p = sub.add_parser("status")
    p.set_defaults(fn=cmd_status)
    a = ap.parse_args()
    try:
        return a.fn(Ctx(a), a)
    except Refused as e:
        print("REFUSED: %s" % e, file=sys.stderr)
        return 1
    except RuntimeError as e:
        print("ERROR: %s" % scrub(e), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
