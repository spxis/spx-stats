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

The snapshot is a small jsonb (a few KB, never over about 24 KB): harvester, daily scores job, scores by league (last good load,
games played with no score, the last run's reason; the admin alerts below come from it), watchdog, releases, DS1 versus
production row counts (the latest drift comparison, meta.sync_status) and the Dropbox backup. A section that cannot be read says
{"error": ...} and the others still go out. State lives in OPS_STATE (default /data/ops.json).

Scores alerts (scripts/runlog, shown on every admin page): from each snapshot, with no extra read, a league raises `scores-stale:<league>`
when its last run failed and it has had no good load for SCORES_STALE_HOURS (6), `scores-overdue:<league>` when a game that started more than
SCORES_OVERDUE_HOURS (12) ago still has no score, and the job raises `scores-no-run` when no run has started for SCORES_NO_RUN_HOURS (20; the job
runs twice a day). Each is raised once when it starts (again after 24 hours while it lasts, so a dismissed alert comes back) and resolved when it clears.

Environment: OPS_SNAPSHOT=0 switches the whole thing off (no snapshot, no requests), SUPABASE_ACCESS_TOKEN (production), PG* (DS1),
OPS_SNAPSHOT_EVERY, OPS_HEARTBEAT_EVERY, OPS_INTERVAL, OPS_STATE, SCORES_STALE_HOURS, SCORES_OVERDUE_HOURS, SCORES_NO_RUN_HOURS, SCORES_WAIT_HOURS, WATCHDOG_STATE (read for the watchdog section), RELEASE_REF,
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
# The leagues the daily scores job loads (scripts/daily/run.py LEAGUES; test_ops.py checks they are the same). WNBA, NWSL, PWHL and MLS are bulk loads, not in it.
SCORE_LEAGUES = ("nhl", "nba", "mlb", "nfl", "cfl")
ALERT_AGAIN_SECS = 24 * 3600             # an alert that lasts is raised again this often, so one an admin dismissed comes back
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
        self.scores_stale = float(e.get("SCORES_STALE_HOURS", "6"))        # a failing league with no good load for this long
        self.scores_overdue = float(e.get("SCORES_OVERDUE_HOURS", "12"))   # a game started this long ago and still without a score
        self.scores_no_run = float(e.get("SCORES_NO_RUN_HOURS", "20"))     # the job itself has not started a run for this long
        self.scores_wait = float(e.get("SCORES_WAIT_HOURS", "4"))          # a game is "played" this long after it started


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


def hours_between(a, b):
    """Hours from datetime a to datetime b, or None when either is missing."""
    return None if a is None or b is None else (b - a).total_seconds() / 3600.0


def league_attempt(l, latest):
    """What the league's most recent attempt came to: (outcome, reason, when). `l` is the league's raw part, `latest` the newest finished run of the
    job. A run that stopped as a whole (no per-league results at all) is the attempt of every league that has no result from it; a run limited
    to another league (an "Update now") is not."""
    last = l.get("last")
    if latest and latest.get("outcome") == "failed" and not latest.get("has_results") and (not last or num(last.get("run_id")) < num(latest.get("run_id"))):
        err = clean(latest.get("error"), 200)
        return "failed", "the whole run stopped" + (": " + err if err else " before this league was saved"), iso_of(latest.get("finished_at") or latest.get("started_at"))
    if not last:
        return "unknown", None, None
    res = last.get("res") or {}
    return (res.get("outcome") or "unknown"), clean(res.get("reason"), 240), iso_of(last.get("at"))


def shape_scores(raw, now, thr):
    """The daily scores job league by league: the last good load, the games played with no score, the last run's outcome and reason in the job's own
    words, and the flags the admin alerts come from. `now` is the snapshot's time, `thr` the hour limits (stale, overdue, no_run).
    flags: "stale" = the last attempt failed (or was skipped with games waiting) and there has been no good load for `stale` hours;
    "overdue" = a game that started more than `overdue` hours ago still has no score. Top level "no_run" = no run has started for `no_run` hours.
    The ages are whole hours, so an unchanged situation gives an unchanged snapshot (it is written when it differs, or hourly)."""
    latest = raw.get("last_run")
    leagues = []
    for lg in SCORE_LEAGUES:
        l = (raw.get("leagues") or {}).get(lg) or {}
        outcome, reason, at = league_attempt(l, latest)
        res = ((l.get("last") or {}).get("res")) or {}
        w = l.get("waiting") or {}
        waiting, overdue = num(w.get("n")), num(w.get("overdue"))
        ok_at = parse_ts(l.get("ok_at"))
        since_ok = hours_between(ok_at, now)
        flags = []
        if (outcome == "failed" or (outcome == "skipped" and waiting > 0)) and (since_ok is None or since_ok > thr["stale"]):
            flags.append("stale")
        if overdue > 0:
            flags.append("overdue")
        leagues.append({
            "league": lg, "outcome": outcome, "reason": reason, "at": at, "ok_at": iso(ok_at), "changed_at": iso_of(l.get("changed_at")),
            "games_skipped": num(res.get("games_skipped")), "clubs_skipped": [clean(c, 60) for c in (res.get("clubs_skipped") or [])[:6]],
            "waiting": waiting, "overdue": overdue, "oldest": iso_of(w.get("oldest")),
            "sample": [[clean(x, 12), clean(y, 60), clean(z, 60)] for x, y, z in (l.get("sample") or [])[:3]],
            "stale_hours": None if since_ok is None else int(since_ok), "flags": flags,
        })
    last_started = parse_ts(raw.get("last_started_at") or (latest or {}).get("started_at"))      # the newest run of any kind, one still running too
    quiet = hours_between(last_started, now)
    return {
        "limits": {"stale": thr["stale"], "overdue": thr["overdue"], "no_run": thr["no_run"]},
        "last_run": ({"id": latest.get("run_id"), "outcome": latest.get("outcome"), "started_at": iso(last_started)} if latest else None),
        "running": bool(raw.get("running")),
        "quiet_hours": None if quiet is None else int(quiet),
        "no_run": quiet is not None and quiet > thr["no_run"] and not raw.get("running"),
        "leagues": leagues,
    }


def score_alert_wants(scores):
    """{alert key: (scope, message, severity)} for what the scores section says is wrong right now."""
    want = {}
    if not isinstance(scores, dict) or "error" in scores:
        return want
    if scores.get("no_run"):
        want["scores-no-run"] = (None, "The daily scores job has not started a run for %d hours (it should run twice a day)." % int(scores.get("quiet_hours") or 0), "error")
    for l in scores.get("leagues") or []:
        lg, name = l["league"], l["league"].upper()
        if "stale" in l["flags"]:
            since = ("%d hours" % int(l["stale_hours"])) if l.get("stale_hours") is not None else "the last 30 days"
            want["scores-stale:" + lg] = (lg, "%s scores have had no good load for %s. Last run: %s." % (name, since, l.get("reason") or l.get("outcome")), "error")
        if "overdue" in l["flags"]:
            first = l["sample"][0] if l.get("sample") else None
            where = " Oldest: %s, %s at %s." % (first[0], first[1], first[2]) if first else ""
            want["scores-overdue:" + lg] = (lg, "%s: %d game(s) started more than %d hours ago and still have no score.%s" % (name, l["overdue"], int(scores["limits"]["overdue"]), where), "warning")
    return want


def score_alert_plan(scores, raised, now):
    """What to tell the run log: [(key, "raise" | "resolve", scope, message, severity)]. `raised` is {key: when it was last raised} (the caller's
    state). A new problem is raised at once; one that lasts is raised again every ALERT_AGAIN_SECS (an alert an admin dismissed comes back);
    one that cleared is resolved. A snapshot whose scores section could not be read changes nothing."""
    if not isinstance(scores, dict) or "error" in scores:
        return []
    want = score_alert_wants(scores)
    plan = []
    for key, (scope, message, severity) in want.items():
        if key not in raised or now - raised[key] >= ALERT_AGAIN_SECS:
            plan.append((key, "raise", scope, message, severity))
    for key in raised:
        if key not in want:
            plan.append((key, "resolve", None, None, None))
    return plan


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


def build_snapshot(parts, runner, now, thresholds=None):
    """parts: the raw answer (or {"error": ...}) of each collector. Returns the payload that goes to production."""
    thr = thresholds or {"stale": 6.0, "overdue": 12.0, "no_run": 20.0}
    return {
        "v": SNAPSHOT_VERSION,
        "at": iso(now),
        "harvester": section(shape_harvester, parts.get("harvester")),
        "daily": section(shape_daily, parts.get("daily")),
        "scores": section(shape_scores, parts.get("scores"), now, thr),
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

def q_scores(cfg):
    """The per-league scores read from DS1: each league's newest result in the heartbeat (ingest.daily_run.summary.league_results), the newest good
    one, the newest that changed games, and the games played with no score. One small query over 30 days of runs and 30 days of games."""
    arr = "array[%s]" % ",".join("'%s'" % lg for lg in SCORE_LEAGUES)
    return """with lg as (select unnest(%(arr)s::text[]) as league),
runs as (select run_id, started_at, finished_at, outcome, summary from ingest.daily_run where started_at > now() - interval '30 days'),
open_games as (
  select s.league_code as league, g.game_date, g.away_team_season_id, g.home_team_season_id, coalesce(g.starts_at, (g.game_date + 1)::timestamptz) as since
  from core.game g join core.season s using (season_id)
  where s.league_code = any(%(arr)s) and g.status in ('scheduled', 'in_progress') and g.phase in ('regular', 'playoffs')
    and g.game_date between current_date - 30 and current_date)
select jsonb_build_object(
  'last_run', (select to_jsonb(r) from (select run_id, started_at, finished_at, outcome, summary ->> 'error' as error, (summary -> 'league_results') is not null as has_results
                                        from runs where outcome <> 'running' order by started_at desc limit 1) r),
  'last_started_at', (select max(started_at) from runs),
  'running', exists (select 1 from runs where outcome = 'running' and started_at > now() - interval '30 minutes'),
  'leagues', (select jsonb_object_agg(l.league, jsonb_build_object(
      'last', (select jsonb_build_object('run_id', r.run_id, 'at', coalesce(r.finished_at, r.started_at), 'res', r.summary -> 'league_results' -> l.league)
               from runs r where (r.summary -> 'league_results') ? l.league and r.outcome <> 'running' order by r.started_at desc limit 1),
      'ok_at', (select max(coalesce(r.finished_at, r.started_at)) from runs r where r.summary -> 'league_results' -> l.league ->> 'outcome' in ('ok', 'warning')),
      'changed_at', (select max(coalesce(r.finished_at, r.started_at)) from runs r where coalesce(nullif(r.summary -> 'league_results' -> l.league ->> 'games_changed', ''), '0')::int > 0),
      'waiting', (select jsonb_build_object('n', count(*) filter (where since < now() - interval '%(wait)s hours'),
                                            'overdue', count(*) filter (where since < now() - interval '%(over)s hours'),
                                            'oldest', min(since) filter (where since < now() - interval '%(wait)s hours'))
                  from open_games g where g.league = l.league),
      'sample', (select coalesce(jsonb_agg(jsonb_build_array(x.game_date, api.team_name(x.away_team_season_id), api.team_name(x.home_team_season_id)) order by x.since), '[]'::jsonb)
                 from (select * from open_games g where g.league = l.league and g.since < now() - interval '%(wait)s hours' order by g.since limit 3) x)))
    from lg l))""" % {"arr": arr, "wait": float(cfg.scores_wait), "over": float(cfg.scores_overdue)}


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
        "scores": guarded(lambda: ds1.json(q_scores(cfg))),
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
    return fit(build_snapshot(collect(cfg, ds1), runner_info(cfg), now, {"stale": cfg.scores_stale, "overdue": cfg.scores_overdue, "no_run": cfg.scores_no_run}))


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


def send_score_alerts(state, payload, now, alert_fn=None):
    """Raise and resolve the scores alerts the snapshot's scores section calls for (score_alert_plan) and remember when each was raised in the
    state. A failed log write never reaches the tick. -> the new state."""
    try:
        if alert_fn is None:
            import runlog_feed as RF
            alert_fn = RF.alert
        raised = dict(state.get("score_alerts") or {})
        plan = score_alert_plan(payload.get("scores"), raised, now)
        for key, what, scope, message, severity in plan:
            try:
                alert_fn(key, what, scope, message, severity)
            except Exception:  # noqa: BLE001
                pass
            if what == "raise":
                raised[key] = now
                log("alert %s raised: %s" % (key, clean(message, 160)))
            else:
                raised.pop(key, None)
                log("alert %s resolved" % key)
        if plan:
            state = dict(state, score_alerts=raised)
    except Exception as e:  # noqa: BLE001
        log("could not send the scores alerts: %s" % clean(e, 120))
    return state


def tick(cfg, state, now, ds1, force=False, collect_fn=None, write_fn=None, queued_fn=None, mark_fn=None, alert_fn=None):
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
        state = send_score_alerts(state, payload, now, alert_fn)
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
    try:       # the run log (scripts/runlog): a failed write never touches the tick
        import runlog_feed as RF
        if out["snapshot"] == "written":
            RF.beat(state, "snap", "ops-snapshot", "snapshot %s written" % state.get("last_id"), 3600, now, kind="ops")
            if state.get("rl_snap_failed"):
                state["rl_snap_failed"] = False
                RF.note("ops-snapshot", "ops", "ok", "snapshots are written again", alert=("ops-snapshot", "resolve"))
        elif out["snapshot"] == "failed" and not state.get("rl_snap_failed"):
            state["rl_snap_failed"] = True
            RF.note("ops-snapshot", "ops", "failed", "the status snapshot could not be written to production", alert=("ops-snapshot", "raise"))
        if now - (state.get("rl_export_at") or 0) >= 300:
            state["rl_export_at"] = now
            RF.feed_raw_export(ds1.json, state)
    except Exception:  # noqa: BLE001
        pass
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
