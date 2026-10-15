#!/usr/bin/env python3
"""The DS1 side of the project on one page: the runner's status snapshot and the controls for /admin/ops.

    python3 -I scripts/release/ops.py            # one tick (the runner calls this every 60 seconds)
    python3 -I scripts/release/ops.py --loop     # tick every OPS_INTERVAL seconds (default 60), forever
    python3 -I scripts/release/ops.py --print    # build the snapshot from DS1 and print it; writes nothing, needs no token
    python3 -I scripts/release/ops.py --now      # tick and write a snapshot now, whatever the timer and the hash say

Production (Vercel) cannot reach DS1, so the runner next to DS1 pushes ONE status snapshot into production, the way the watchdog
copies its incidents (AGENTS.md section 8). One tick does at most two Management API calls:

  1. every tick: ONE small read of meta.ops_request (a signed-in admin's clicks on /admin/ops: Snapshot now, Pause harvester, Resume
     harvester). Pause writes the switch the harvester reads each cycle (ingest.harvest_state key ops_pause, scripts/harvest/pause.py),
     Resume deletes it; each request is marked done or failed on production afterwards. "Check drift now" is not here: it is the
     existing drift request that release.py run handles.
  2. every OPS_SNAPSHOT_EVERY seconds (900): build a snapshot from DS1 (psql, no production call) and write it with
     meta.ops_status_put when it differs from the last one written, or when the last write is OPS_HEARTBEAT_EVERY (3600) old, so the page
     can tell a quiet system from a dead runner. A request that asked for a snapshot forces one. Production keeps the newest 96 rows.

The snapshot is a small jsonb (a few KB, never over about 24 KB): harvester, daily scores job, watchdog, releases, DS1 versus
production row counts (the latest drift comparison, meta.sync_status) and the Dropbox backup. A section that cannot be read says
{"error": ...} and the others still go out. State lives in OPS_STATE (default /data/ops.json).

Environment: OPS_SNAPSHOT=0 switches the whole thing off (no snapshot, no requests), SUPABASE_ACCESS_TOKEN (production), PG* (DS1),
OPS_SNAPSHOT_EVERY, OPS_HEARTBEAT_EVERY, OPS_INTERVAL, OPS_STATE, WATCHDOG_STATE (read for the watchdog section), RELEASE_REF,
RELEASE_REPO. Standard library only. Exit code 0 unless --print or --now could not do their one job.
"""
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import watchdog as W  # noqa: E402  (the Management API call and the project reference)

SNAPSHOT_VERSION = 1
MAX_PAYLOAD_BYTES = 24000                # the table's check allows 32000
STALE_BEAT_SECS = 900                    # a running harvester whose heartbeat is older than this is stuck or dead
REQUEST_KINDS = ("snapshot", "harvest_pause", "harvest_resume")
# What changes on its own every time and must not make a snapshot look new.
VOLATILE = (("at",), ("harvester", "last_beat_at"), ("watchdog", "last_probe_at"))


def log(msg):
    print("%s ops: %s" % (datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S"), msg), flush=True)


class Config:
    def __init__(self, env=None):
        e = os.environ if env is None else env
        self.enabled = e.get("OPS_SNAPSHOT", "1").strip().lower() not in ("0", "off", "false", "no")
        self.every = int(e.get("OPS_SNAPSHOT_EVERY", "900"))
        self.heartbeat = int(e.get("OPS_HEARTBEAT_EVERY", "3600"))
        self.interval = int(e.get("OPS_INTERVAL", "60"))
        self.state_path = e.get("OPS_STATE", "/data/ops.json")
        self.watchdog_state = e.get("WATCHDOG_STATE", "/data/watchdog.json")
        self.repo = e.get("RELEASE_REPO", "/work/repo")
        self.ref = e.get("RELEASE_REF", "origin/main")
        self.last_drift_file = e.get("OPS_LAST_DRIFT", "/data/last_drift")
        self.wd = W.Config(e)             # token, project reference and Management API address
        self.token = self.wd.token
        self.psql_timeout = int(e.get("OPS_PSQL_TIMEOUT", "60"))


# ---------------------------------------------------------------------------------------------------- small pure helpers

def parse_ts(v):
    """A timestamp from jsonb (or None) as an aware datetime, or None when it is missing or unreadable."""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return datetime.datetime.fromtimestamp(v, datetime.timezone.utc)
    try:
        d = datetime.datetime.fromisoformat(str(v).strip().replace("Z", "+00:00").replace(" ", "T", 1))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=datetime.timezone.utc)


def iso(d):
    """UTC, whole seconds, ending in Z (or None)."""
    return None if d is None else d.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def iso_of(v):
    return iso(parse_ts(v))


def clean(v, n=200):
    """Free text bound for production: no control characters (jsonb refuses a NUL), at most n characters."""
    if v is None:
        return None
    return re.sub(r"\s+", " ", re.sub(r"[\x00-\x1f\x7f]+", " ", str(v))).strip()[:n]


def num(v, default=0):
    try:
        return int(v)
    except (TypeError, ValueError):
        try:
            return int(float(v))
        except (TypeError, ValueError):
            return default


def section(fn, raw, *args):
    """Shape one section; a collector that failed ({"error": ...}) or a shape that breaks becomes {"error": ...}, never an exception."""
    if isinstance(raw, dict) and "error" in raw and len(raw) == 1:
        return {"error": clean(raw["error"], 160)}
    try:
        return fn(raw, *args)
    except Exception as e:  # noqa: BLE001 - a surprise in one section must not cost the others
        return {"error": clean("%s: %s" % (type(e).__name__, e), 160)}


# ---------------------------------------------------------------------------------------------------- the sections (pure)

def shape_harvester(raw):
    """From ingest.harvest_progress(), the last hour of ingest.harvest_fetch, the pause switch and DS1's clock."""
    prog = raw.get("progress") or {}
    hour = raw.get("hour") or {}
    flag = raw.get("flag")
    db_now = parse_ts(raw.get("db_now"))
    run = prog.get("last_run")
    queue = {}
    for r in prog.get("queue") or []:
        queue.setdefault(r["kind"], {})[r["state"]] = num(r["n"])
    gap = [[g["kind"], g.get("league") or "-", num(g["n"])] for g in prog.get("gap_left") or []]
    gap.sort(key=lambda g: (g[0], g[1]))
    beat = parse_ts(run.get("last_beat_at")) if run else None
    age = (db_now - beat).total_seconds() if beat and db_now else None
    if flag:
        state = "paused"
    elif not run:
        state = "never"
    elif run.get("outcome") == "running":
        state = "stale" if age is None or age > STALE_BEAT_SECS else "running"
    else:
        state = "stopped" if age is None or age > STALE_BEAT_SECS else "idle"
    today = prog.get("today") or {}
    err = prog.get("last_error")
    return {
        "state": state,
        "paused": ({"by": clean((flag or {}).get("by"), 80), "at": iso_of((flag or {}).get("at"))} if flag else None),
        "last_beat_at": iso(beat),
        "run": ({"id": run.get("run_id"), "outcome": run.get("outcome"), "started_at": iso_of(run.get("started_at")), "sha": clean(run.get("git_sha"), 12),
                 "paused_secs": num(((run.get("summary") or {}).get("paused_secs")))} if run else None),
        "queue": queue,
        "queued_total": sum(v.get("queued", 0) for v in queue.values()),
        "gap": gap,
        "gap_total": sum(g[2] for g in gap),
        "today": {"requests": num(today.get("requests")), "bytes": num(today.get("bytes")), "archived": num(today.get("archived"))},
        "hour": {"requests": num(hour.get("requests")), "bytes": num(hour.get("bytes")), "archived": num(hour.get("archived"))},
        "last_error": ({"kind": err.get("kind"), "target": clean(err.get("target"), 100), "error": clean(err.get("error"), 200), "at": iso_of(err.get("at"))} if err else None),
        "archive_rows": num(prog.get("archive_rows")),
    }


def shape_daily(raw):
    """The daily scores job: its latest run, the last week's outcomes and the latest daily_scores release."""
    run = raw.get("run")
    counts = {}
    for k, v in sorted(((run or {}).get("summary") or {}).items()):
        if isinstance(v, (int, float)) and not isinstance(v, bool) and len(counts) < 8:
            counts[clean(k, 40)] = v
    rel = raw.get("release")
    return {
        "last": ({"id": run.get("run_id"), "outcome": run.get("outcome"), "started_at": iso_of(run.get("started_at")),
                  "finished_at": iso_of(run.get("finished_at")), "counts": counts} if run else None),
        "ok_7d": num(raw.get("ok_7d")),
        "failed_7d": num(raw.get("failed_7d")),
        "release": ({"number": rel.get("number"), "status": rel.get("status"), "at": iso_of(rel.get("created_at"))} if rel else None),
    }


def shape_releases(raw, runner):
    c = raw.get("counts") or {}
    done, failed = raw.get("last_done"), raw.get("last_failed")
    pick = lambda r: ({"number": r.get("number"), "title": clean(r.get("title"), 80), "kind": r.get("kind"), "at": iso_of(r.get("finished_at"))} if r else None)
    return {
        "pending": num(c.get("pending")), "approved": num(c.get("approved")), "running": num(c.get("running")),
        "last_done": pick(done), "last_failed": pick(failed),
        "drift_checked_at": iso_of(raw.get("drift_checked_at")),
        "nightly_drift_day": runner.get("last_drift"),
        "runner": {"sha": runner.get("sha"), "ref": runner.get("ref")},
    }


def shape_sync(rows):
    """meta.sync_status as [name, DS1 rows, production rows, 1 when it differs]. Compact: about 35 bytes a table."""
    tables = []
    checked = []
    for r in rows or []:
        name, ds1, prod, state, at = r
        tables.append([name, ds1, prod, 1 if state == "differs" else 0])
        t = parse_ts(at)
        if t:
            checked.append(t)
    tables.sort(key=lambda t: (-t[3], t[0]))
    return {"tables": tables, "differs": sum(t[3] for t in tables), "count": len(tables),
            "checked_at": iso(max(checked)) if checked else None, "oldest_checked_at": iso(min(checked)) if checked else None}


def shape_backup(raw):
    """The raw archive on DS1 and what spx-raw-export.sh reported at the end of its last run (migration 105)."""
    ex = raw.get("export")
    ok = raw.get("export_ok")
    if isinstance(ex, dict) and "error" in ex:
        export = {"error": clean(ex["error"], 120)}
    elif ex:
        export = {"at": iso_of(ex.get("finished_at")), "outcome": ex.get("outcome"), "checked": num(ex.get("checked")), "copied": num(ex.get("copied")),
                  "present": num(ex.get("present")), "failed": num(ex.get("failed")), "bytes": num(ex.get("bytes")), "seconds": ex.get("seconds")}
    else:
        export = None                     # no row at all: the export has never run (or never reached DS1)
    return {"archive_rows": num(raw.get("archive_rows")), "archive_bytes": num(raw.get("archive_bytes")), "export": export,
            "last_ok_at": iso_of((ok or {}).get("finished_at")) if ok else None}


def shape_watchdog(state, events, enabled):
    """The watchdog's state file (last probe, streak) and the incidents it recorded on DS1."""
    state = state or {}
    ev = events or []
    first = lambda: ev[0] if ev else None
    open_ev = first() if ev and ev[0].get("recovered_at") is None else None
    last = lambda e: ({"since": iso_of(e.get("failing_since")), "recovered_at": iso_of(e.get("recovered_at")), "reload_at": iso_of(e.get("reload_at")),
                       "restart_at": iso_of(e.get("restart_at")), "probes_failed": num(e.get("probes_failed")),
                       "error": clean(e.get("last_error"), 120)} if e else None)
    return {
        "enabled": enabled,
        "known": bool(state),
        "last_probe_at": iso_of(state.get("last_probe_at")),
        "last_ok_at": iso_of(state.get("last_ok_at")),
        "last_probe_ok": state.get("last_probe_ok"),
        "streak": num(state.get("streak")),
        "last_error": clean(state.get("last_error"), 120),
        "open": last(open_ev),
        "last_incident": last(first()),
    }


def build_snapshot(parts, runner, now):
    """parts: the raw answer (or {"error": ...}) of each collector. Returns the payload that goes to production."""
    return {
        "v": SNAPSHOT_VERSION,
        "at": iso(now),
        "harvester": section(shape_harvester, parts.get("harvester")),
        "daily": section(shape_daily, parts.get("daily")),
        "watchdog": section(lambda p: shape_watchdog(p["state"], p["events"], p["enabled"]), parts.get("watchdog")),
        "releases": section(shape_releases, parts.get("releases"), runner),
        "sync": section(shape_sync, parts.get("sync")),
        "backup": section(shape_backup, parts.get("backup")),
    }


def fit(payload, limit=MAX_PAYLOAD_BYTES):
    """Keep the payload under the limit: when it is too big, drop the tables that match (the differing ones stay) and say so."""
    if len(json.dumps(payload, separators=(",", ":"))) <= limit:
        return payload
    out = json.loads(json.dumps(payload))
    s = out.get("sync")
    if isinstance(s, dict) and "tables" in s:
        s["tables"] = [t for t in s["tables"] if t[3]][:60]
        s["trimmed"] = True
    return out


def payload_hash(payload):
    """sha256 of the payload without what changes on its own (the snapshot's own time, the heartbeat, the last probe)."""
    p = json.loads(json.dumps(payload))
    for path in VOLATILE:
        d = p
        for k in path[:-1]:
            d = d.get(k) if isinstance(d, dict) else None
        if isinstance(d, dict):
            d.pop(path[-1], None)
    return hashlib.sha256(json.dumps(p, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def decide(state, digest, now, cfg, force=False):
    """'write' or 'skip' for a snapshot that is due: write when forced, when nothing was ever written, when it differs, or when the last write is old."""
    if force or not state.get("last_hash") or state.get("last_write") is None:
        return "write"
    if digest != state["last_hash"]:
        return "write"
    return "write" if now - state["last_write"] >= cfg.heartbeat else "skip"


def snapshot_due(state, now, cfg, force=False):
    return force or state.get("last_try") is None or now - state["last_try"] >= cfg.every


# ---------------------------------------------------------------------------------------------------- DS1

def ql(v):
    return W.ql(v)


class Ds1:
    """DS1 through psql with the container's PG* settings."""

    def __init__(self, timeout=60, env=None):
        self.timeout = timeout
        self.env = dict(os.environ if env is None else env, PGCONNECT_TIMEOUT="10", PGOPTIONS="-c statement_timeout=%d" % (timeout * 1000))

    def run(self, sql):
        r = subprocess.run(["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql], capture_output=True, text=True, env=self.env, timeout=self.timeout + 15)
        if r.returncode != 0:
            lines = [x for x in r.stderr.strip().splitlines() if x.strip()]
            raise RuntimeError(((next((x for x in lines if "ERROR" in x or "FATAL" in x), None) or (lines[0] if lines else "psql failed")))[:200])
        return r.stdout

    def json(self, sql):
        out = self.run(sql).strip()
        return json.loads(out.splitlines()[0]) if out else None


Q_HARVESTER = """select jsonb_build_object(
  'progress', ingest.harvest_progress(),
  'hour', (select jsonb_build_object('requests', count(*), 'bytes', coalesce(sum(bytes), 0), 'archived', coalesce(sum(new_items), 0))
           from ingest.harvest_fetch where at >= now() - interval '1 hour'),
  'flag', (select value from ingest.harvest_state where key = 'ops_pause'),
  'db_now', now())"""

Q_DAILY = """select jsonb_build_object(
  'run', (select to_jsonb(r) from (select run_id, started_at, finished_at, outcome, summary from ingest.daily_run order by started_at desc limit 1) r),
  'ok_7d', (select count(*) from ingest.daily_run where outcome = 'ok' and started_at > now() - interval '7 days'),
  'failed_7d', (select count(*) from ingest.daily_run where outcome = 'failed' and started_at > now() - interval '7 days'),
  'release', (select to_jsonb(x) from (select number, status, created_at from meta.data_release where kind = 'daily_scores' order by id desc limit 1) x))"""

Q_RELEASES = """select jsonb_build_object(
  'counts', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from meta.data_release where status in ('pending', 'approved', 'running') group by 1) q),
  'last_done', (select to_jsonb(x) from (select number, title, kind, finished_at from meta.data_release where status = 'done' order by id desc limit 1) x),
  'last_failed', (select to_jsonb(x) from (select number, title, kind, finished_at from meta.data_release where status = 'failed' order by id desc limit 1) x),
  'drift_checked_at', (select max(checked_at) from meta.sync_status))"""

Q_SYNC = """select coalesce(jsonb_agg(jsonb_build_array(table_name, ds1_rows, prod_rows, state, checked_at) order by table_name), '[]'::jsonb) from meta.sync_status"""

Q_ARCHIVE = """select jsonb_build_object('archive_rows', count(*), 'archive_bytes', coalesce(sum(length(data)), 0)) from legacy_files.raw_archive"""

Q_EXPORT = """select jsonb_build_object(
  'export', (select to_jsonb(e) from (select finished_at, outcome, checked, copied, present, failed, bytes, seconds from ingest.raw_export_run order by id desc limit 1) e),
  'export_ok', (select to_jsonb(e) from (select finished_at from ingest.raw_export_run where outcome = 'ok' order by id desc limit 1) e))"""

Q_EVENTS = """select coalesce(jsonb_agg(to_jsonb(e) order by e.failing_since desc), '[]'::jsonb) from (select * from meta.api_health_event order by failing_since desc limit 3) e"""


def read_json_file(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def runner_info(cfg):
    sha = None
    try:
        r = subprocess.run(["git", "-C", cfg.repo, "rev-parse", "--short", "HEAD"], capture_output=True, text=True, timeout=10)
        sha = r.stdout.strip() or None
    except Exception:  # noqa: BLE001
        pass
    try:
        with open(cfg.last_drift_file) as f:
            day = f.read().strip()[:10] or None
    except OSError:
        day = None
    return {"sha": sha, "ref": clean(cfg.ref, 60), "last_drift": day}


def guarded(fn):
    try:
        return fn()
    except Exception as e:  # noqa: BLE001 - one section failing is data, not an error
        return {"error": clean(e, 160)}


def collect(cfg, ds1):
    """Every raw part, each read on its own so a missing table costs one section."""
    parts = {
        "harvester": guarded(lambda: ds1.json(Q_HARVESTER)),
        "daily": guarded(lambda: ds1.json(Q_DAILY)),
        "releases": guarded(lambda: ds1.json(Q_RELEASES)),
        "sync": guarded(lambda: ds1.json(Q_SYNC)),
    }

    def backup():
        b = ds1.json(Q_ARCHIVE)
        try:
            b.update(ds1.json(Q_EXPORT))
        except Exception as e:  # noqa: BLE001 - migration 105 not applied on DS1
            b["export"] = {"error": "ingest.raw_export_run: " + clean(e, 100)}
        return b
    parts["backup"] = guarded(backup)

    def watchdog():
        try:
            events = ds1.json(Q_EVENTS)
        except Exception:  # noqa: BLE001 - migration 090 not applied on DS1
            events = []
        return {"state": read_json_file(cfg.watchdog_state), "events": events, "enabled": os.environ.get("WATCHDOG", "1").strip() not in ("0", "off", "false", "no")}
    parts["watchdog"] = guarded(watchdog)
    return parts


def snapshot_now(cfg, ds1, now=None):
    now = now or datetime.datetime.now(datetime.timezone.utc)
    return fit(build_snapshot(collect(cfg, ds1), runner_info(cfg), now))


# ---------------------------------------------------------------------------------------------------- production

def prod_query(cfg, sql, timeout=30):
    """Rows (a list of dicts) from the Management API database/query endpoint. Raises on any failure."""
    status, body = W.mgmt_call(cfg.wd, "POST", "/database/query", {"query": sql}, timeout=timeout)
    if status >= 300:
        raise RuntimeError("HTTP %d" % status)
    return body if isinstance(body, list) else []


def write_snapshot(cfg, digest, payload):
    rows = prod_query(cfg, "select meta.ops_status_put(%s, %s::jsonb) as id" % (ql(digest), ql(json.dumps(payload, separators=(",", ":"), ensure_ascii=True))), timeout=40)
    return rows[0].get("id") if rows else None


def queued_requests(cfg):
    return prod_query(cfg, "select id, kind, requested_by from meta.ops_request where status = 'queued' order by id limit 10", timeout=20)


def mark_request(cfg, rid, status, summary):
    prod_query(cfg, "update meta.ops_request set status = %s, finished_at = now(), summary = %s where id = %d and status = 'queued'"
               % (ql(status), ql(clean(summary, 300)), int(rid)), timeout=20)


def pause_harvester(ds1, who, now):
    value = json.dumps({"by": clean(who, 80), "at": iso(now)})
    ds1.run("insert into ingest.harvest_state (key, value, updated_at) values ('ops_pause', %s::jsonb, now()) "
            "on conflict (key) do update set value = excluded.value, updated_at = now()" % ql(value))
    return "Harvester paused; it stands still within about a minute (a request already sent finishes first)."


def resume_harvester(ds1):
    ds1.run("delete from ingest.harvest_state where key = 'ops_pause'")
    return "Harvester resumed; it starts again within about a minute."


def handle_request(req, ds1, now):
    """-> (status, summary, wants_snapshot). Pause and resume are idempotent, so a request whose mark did not get through is safe to do again."""
    kind, who = req.get("kind"), req.get("requested_by") or "an admin"
    try:
        if kind == "harvest_pause":
            return "done", pause_harvester(ds1, who, now), True
        if kind == "harvest_resume":
            return "done", resume_harvester(ds1), True
        if kind == "snapshot":
            return "done", "Snapshot written.", True
    except Exception as e:  # noqa: BLE001
        return "failed", "DS1: " + clean(e, 200), False
    return "failed", "Unknown request kind.", False


# ---------------------------------------------------------------------------------------------------- the tick

def load_state(path):
    s = read_json_file(path)
    return s if isinstance(s, dict) else {}


def save_state(path, state):
    try:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w") as f:
            json.dump(state, f)
        os.replace(tmp, path)
    except OSError as e:
        log("could not save the state: %s" % e)


def tick(cfg, state, now, ds1, force=False, collect_fn=None, write_fn=None, queued_fn=None, mark_fn=None):
    """One minute of work. Returns (new state, what happened: {"requests": [...], "snapshot": "written|unchanged|not due|failed|no token"}).
    The *_fn arguments stand in for production and DS1 in tests."""
    collect_fn = collect_fn or (lambda: snapshot_now(cfg, ds1, datetime.datetime.fromtimestamp(now, datetime.timezone.utc)))
    write_fn = write_fn or (lambda digest, payload: write_snapshot(cfg, digest, payload))
    queued_fn = queued_fn or (lambda: queued_requests(cfg))
    mark_fn = mark_fn or (lambda rid, status, summary: mark_request(cfg, rid, status, summary))
    state = dict(state)
    out = {"requests": [], "snapshot": "not due"}
    done = []
    if cfg.token:
        try:
            for req in queued_fn():
                status, summary, wants = handle_request(req, ds1, datetime.datetime.fromtimestamp(now, datetime.timezone.utc))
                log("request %s %s from %s: %s" % (req.get("id"), req.get("kind"), req.get("requested_by"), status))
                done.append((req.get("id"), status, summary))
                out["requests"].append((req.get("id"), req.get("kind"), status))
                force = force or wants
        except Exception as e:  # noqa: BLE001 - production does not answer, or migration 104 is not there yet
            if not state.get("requests_err") or now - state["requests_err"] > 3600:
                log("could not read the requests (will keep trying, quietly): %s" % clean(e, 160))
                state["requests_err"] = now
    if snapshot_due(state, now, cfg, force):
        state["last_try"] = now
        payload = collect_fn()
        digest = payload_hash(payload)
        if not cfg.token:
            out["snapshot"] = "no token"
        elif decide(state, digest, now, cfg, force) == "skip":
            out["snapshot"] = "unchanged"
        else:
            try:
                sid = write_fn(digest, payload)
                state.update(last_hash=digest, last_write=now, last_id=sid)
                out["snapshot"] = "written"
                log("snapshot %s written (%d bytes)" % (sid, len(json.dumps(payload, separators=(",", ":")))))
            except Exception as e:  # noqa: BLE001
                state["last_try"] = now - cfg.every + 300      # try again in 5 minutes, not every minute
                out["snapshot"] = "failed"
                log("could not write the snapshot (retry in 5 minutes): %s" % clean(e, 160))
    for rid, status, summary in done:
        if status == "done" and out["snapshot"] == "failed":
            status, summary = "failed", "The snapshot could not be written: production did not answer."
        try:
            mark_fn(rid, status, summary)
        except Exception as e:  # noqa: BLE001 - it stays queued and is done again next minute (idempotent)
            log("could not mark request %s (it will be repeated): %s" % (rid, clean(e, 120)))
    return state, out


def main(argv):
    cfg = Config()
    if not cfg.enabled:
        log("switched off (OPS_SNAPSHOT=0)")
        if "--loop" in argv:
            while True:
                time.sleep(3600)
        return 0
    ds1 = Ds1(cfg.psql_timeout)
    if "--print" in argv:
        print(json.dumps(snapshot_now(cfg, ds1), indent=1))
        return 0
    if "--loop" in argv:
        log("started: a tick every %d s, a snapshot every %d s" % (cfg.interval, cfg.every))
        while True:
            try:
                state, _ = tick(cfg, load_state(cfg.state_path), time.time(), ds1)
                save_state(cfg.state_path, state)
            except Exception as e:  # noqa: BLE001 - this loop must never die
                log("loop error: %s" % clean(e, 200))
            time.sleep(cfg.interval)
    state, out = tick(cfg, load_state(cfg.state_path), time.time(), ds1, force="--now" in argv)
    save_state(cfg.state_path, state)
    if "--now" in argv:
        print(json.dumps(out))
        return 0 if out["snapshot"] in ("written", "unchanged") else 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
