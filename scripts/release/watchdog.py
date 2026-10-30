#!/usr/bin/env python3
"""API watchdog for the release runner: probe production's public REST API once a minute and, if it stays down, nudge it.

    python3 -I scripts/release/watchdog.py            # one probe (the runner calls this every 60 seconds)
    python3 -I scripts/release/watchdog.py --loop     # probe every WATCHDOG_INTERVAL seconds (default 60), forever

On 2026-10-14 production PostgREST stalled (statement timeouts, then PGRST002 "could not query the database for the schema
cache", 503 on every uncached page) for about 90 minutes until John restarted the project by hand. The state machine here does
what he did, in order, but only after the API has been down for a while:

  1. every probe is ONE cheap read through the public URL (api.games, one league and year, limit 1), 8 s timeout;
  2. after 5 probes in a row fail: NOTIFY pgrst, 'reload schema' (Management API database/query);
  3. after 5 more: POST /v1/projects/<ref>/restart, at most once an hour; then probe failures are ignored for
     WATCHDOG_GRACE seconds (default 600) while the project comes back;
  4. the first probe that works again closes the incident.

Each incident is one row in meta.api_health_event (migration 090), written on DS1 and copied to production for the /admin/data
"API health" line. A missing table is logged and skipped. State lives in WATCHDOG_STATE (default /data/watchdog.json).

Environment: SUPABASE_ACCESS_TOKEN (needed for the nudges), WATCHDOG=0 switches everything off, WATCHDOG_URL, WATCHDOG_KEY (public
publishable key), WATCHDOG_REF, WATCHDOG_DOWN_AFTER / WATCHDOG_RESTART_AFTER (5 / 5), WATCHDOG_RESTART_GAP (3600), PG* for DS1.
Standard library only. Exit code is always 0 for a probe (a failed probe is data, not an error).
"""
import datetime
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

PROJECT_REF = "njpvfrceahkvnrduerkk"
PUBLIC_KEY = "sb_publishable_FmeiL6oX9_Mrb8psQZFSQg_YO_O4afC"  # public by design, same as web/src/lib/api/config.ts
PROBE_PATH = "games?league=eq.nhl&year=eq.2010&select=game_id&limit=1"
MGMT = "https://api.supabase.com/v1/projects/%s"
# Project states in which a restart or a reload would only get in the way.
BUSY_STATES = {"COMING_UP", "GOING_DOWN", "INACTIVE", "PAUSED", "PAUSING", "RESTORING", "UPGRADING", "RESTARTING", "REMOVED",
               "INIT_FAILED", "UNKNOWN"}


def log(msg):
    print("%s watchdog: %s" % (datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S"), msg), flush=True)


class Config:
    def __init__(self, env=None):
        e = os.environ if env is None else env
        self.enabled = e.get("WATCHDOG", "1").strip() not in ("0", "off", "false", "no")
        self.ref = e.get("WATCHDOG_REF", PROJECT_REF)
        self.base = (e.get("WATCHDOG_URL") or "https://%s.supabase.co/rest/v1/" % self.ref).rstrip("/") + "/"
        self.key = e.get("WATCHDOG_KEY", PUBLIC_KEY)
        self.token = e.get("SUPABASE_ACCESS_TOKEN", "")
        self.down_after = int(e.get("WATCHDOG_DOWN_AFTER", "5"))
        self.restart_after = int(e.get("WATCHDOG_RESTART_AFTER", "5"))
        self.restart_gap = int(e.get("WATCHDOG_RESTART_GAP", "3600"))
        self.grace = int(e.get("WATCHDOG_GRACE", "600"))
        self.probe_timeout = float(e.get("WATCHDOG_PROBE_TIMEOUT", "8"))
        self.interval = int(e.get("WATCHDOG_INTERVAL", "60"))
        self.state_path = e.get("WATCHDOG_STATE", "/data/watchdog.json")
        self.mgmt = e.get("WATCHDOG_MGMT_URL", MGMT % self.ref).rstrip("/")


# ---------------------------------------------------------------------------------------------------- the state machine

def new_state():
    return {
        "streak": 0,            # probes that failed in a row (frozen during the grace after a restart)
        "failing_since": None,  # unix time of the first failed probe of this streak
        "detected": False,      # the incident has been recorded (streak reached down_after)
        "reload_streak": None,  # the streak count at which the schema reload was sent
        "reload_at": None,
        "restart_at": None,     # restart of this incident
        "last_restart": None,   # latest restart ever (the once-an-hour limit)
        "grace_until": 0,
        "last_error": None,
    }


def step(state, ok, now, cfg):
    """One probe result in, (new state, actions) out. Pure: no clock, no network. Actions are what the caller should do:

      ("detected",)   the API has been down for down_after probes: record the incident
      ("reload",)     send NOTIFY pgrst, 'reload schema'
      ("restart",)    restart the project
      ("recovered",)  the API answers again after a recorded incident

    The caller tells back with `done(state, action, now)` once it has really sent a reload or a restart, so an action it could
    not send (the project is mid-change, the network is down) is offered again on the next probe."""
    s = dict(state)
    actions = []
    if ok:
        if s["detected"]:
            actions.append(("recovered",))
        # keep last_restart (the hourly limit outlives the incident); everything else starts over
        # and the run log's beat times (rl_*), or the hourly "probes are answering" entry would be written on every good probe
        keep = {k: s.get(k) for k in ("last_restart", "episode", "synced")}
        keep.update({k: v for k, v in s.items() if k.startswith("rl_")})
        s = new_state()
        s.update(keep)
        return s, actions
    if now < s["grace_until"]:
        return s, actions  # the project is coming back from a restart: this failure does not count
    s["streak"] += 1
    if s["failing_since"] is None:
        s["failing_since"] = now
    if s["streak"] >= cfg.down_after and not s["detected"]:
        s["detected"] = True
        actions.append(("detected",))
    if s["detected"]:
        if s["reload_at"] is None:
            actions.append(("reload",))
        elif (s["streak"] >= s["reload_streak"] + cfg.restart_after
              and (s["last_restart"] is None or now - s["last_restart"] >= cfg.restart_gap)):
            actions.append(("restart",))
    return s, actions


def done(state, action, now, cfg):
    """The caller sent `action` (reload or restart). A restart opens the grace period."""
    s = dict(state)
    if action == "reload":
        s["reload_at"] = now
        s["reload_streak"] = s["streak"]
    elif action == "restart":
        s["restart_at"] = now
        s["last_restart"] = now
        s["grace_until"] = now + cfg.grace
    return s


# ---------------------------------------------------------------------------------------------------- the outside world

def probe(cfg):
    """(ok, why). ok means HTTP 200 and a JSON list. Anything else, including a timeout, is a failure."""
    req = urllib.request.Request(cfg.base + PROBE_PATH, headers={"apikey": cfg.key, "Accept-Profile": "api", "Accept": "application/json",
                                                                  "User-Agent": "spx-stats-watchdog/1"})
    try:
        with urllib.request.urlopen(req, timeout=cfg.probe_timeout) as r:
            body = r.read(200_000)
            if r.status != 200:
                return False, "HTTP %d" % r.status
            return (True, "") if isinstance(json.loads(body), list) else (False, "not a list")
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read(2000)).get("code") or ""
        except Exception:  # noqa: BLE001
            detail = ""
        return False, ("HTTP %d %s" % (e.code, detail)).strip()
    except Exception as e:  # noqa: BLE001 - timeout, DNS, reset, bad JSON
        return False, (type(e).__name__ + ": " + str(e))[:120]


def mgmt_call(cfg, method, path, body=None, timeout=30):
    """(status, parsed json or None) from the Management API; raises on a network error."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(cfg.mgmt + path, data=data, method=method,
                                 headers={"Authorization": "Bearer " + cfg.token, "Content-Type": "application/json", "User-Agent": "spx-stats-watchdog/1"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw.strip() else None)
    except urllib.error.HTTPError as e:
        return e.code, None


def project_ready(cfg):
    """True when the Management API answers and the project is not paused, restarting or being restored. Costs one GET."""
    try:
        status, info = mgmt_call(cfg, "GET", "", timeout=15)
    except Exception as e:  # noqa: BLE001 - the Management API is unreachable: from here we cannot act, so do not try
        log("cannot reach the Management API (%s): holding off" % str(e)[:100])
        return False
    if status != 200 or not isinstance(info, dict):
        log("Management API answered %s for the project: holding off" % status)
        return False
    state = str(info.get("status") or "UNKNOWN").upper()
    if state in BUSY_STATES:
        log("project status is %s: holding off" % state)
        return False
    return True


def send_reload(cfg):
    status, _ = mgmt_call(cfg, "POST", "/database/query", {"query": "NOTIFY pgrst, 'reload schema'"})
    return status < 300, "HTTP %d" % status


def send_restart(cfg):
    status, _ = mgmt_call(cfg, "POST", "/restart", {})
    return status < 300, "HTTP %d" % status


# ---------------------------------------------------------------------------------------------------- the record

def ql(v):
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


def ts(t):
    return None if t is None else datetime.datetime.fromtimestamp(t, datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S+00")


def upsert_sql(ep):
    """Idempotent write of one incident (keyed by failing_since). Safe to run twice and from either side."""
    return ("insert into meta.api_health_event (failing_since, detected_at, probes_failed, reload_at, restart_at, recovered_at, last_error, updated_at) "
            "values (%s::timestamptz, %s::timestamptz, %d, %s::timestamptz, %s::timestamptz, %s::timestamptz, %s, now()) "
            "on conflict (failing_since) do update set probes_failed = excluded.probes_failed, reload_at = excluded.reload_at, "
            "restart_at = excluded.restart_at, recovered_at = excluded.recovered_at, last_error = excluded.last_error, updated_at = now()"
            % (ql(ts(ep["failing_since"])), ql(ts(ep["detected_at"])), int(ep["probes_failed"]), ql(ts(ep.get("reload_at"))),
               ql(ts(ep.get("restart_at"))), ql(ts(ep.get("recovered_at"))), ql((ep.get("last_error") or "")[:300] or None)))


def write_ds1(sql):
    if not (os.environ.get("PGHOST") or os.environ.get("SPX_DS1_HOST")):
        raise RuntimeError("no DS1 settings")
    env = dict(os.environ, PGCONNECT_TIMEOUT="10")
    if os.environ.get("SPX_DS1_HOST") and not env.get("PGHOST"):
        env["PGHOST"] = os.environ["SPX_DS1_HOST"]
    r = subprocess.run(["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], capture_output=True, text=True, env=env, timeout=60)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip()[:200])


def write_prod(cfg, sql):
    status, _ = mgmt_call(cfg, "POST", "/database/query", {"query": sql}, timeout=20)
    if status >= 300:
        raise RuntimeError("HTTP %d" % status)


def sync_record(state, cfg, writers):
    """Write the open incident to every side that is behind (state["episode"] has a rev; state["synced"] has one per side)."""
    ep = state.get("episode")
    if not ep:
        return
    for side, write in writers.items():
        if state["synced"].get(side, 0) >= ep["rev"]:
            continue
        try:
            write(upsert_sql(ep))
            state["synced"][side] = ep["rev"]
        except Exception as e:  # noqa: BLE001 - a missing table (migration 090 not applied) or a network error must not stop the watchdog
            log("could not record the incident on %s (will retry): %s" % (side, str(e)[:160]))
    if ep.get("recovered_at") is not None and all(state["synced"].get(s, 0) >= ep["rev"] for s in writers):
        state["episode"] = None  # finished and written everywhere
        state["synced"] = {}


def touch(state, **fields):
    ep = state["episode"]
    ep.update(fields)
    ep["rev"] += 1


def run_once(cfg, state, now, probe_fn=probe, reload_fn=send_reload, restart_fn=send_restart, ready_fn=project_ready, writers=None):
    """One loop: probe, step the machine, do what it says, record. Returns the new state."""
    ok, why = probe_fn(cfg)
    state, actions = step(state, ok, now, cfg)
    state.setdefault("episode", None)
    state.setdefault("synced", {})
    # what /admin/ops shows (scripts/release/ops.py reads this file): when the last probe ran and when one last worked
    state["last_probe_at"], state["last_probe_ok"] = now, bool(ok)
    if ok:
        state["last_ok_at"] = now
    if not ok:
        state["last_error"] = why
        log("probe failed (%d in a row): %s" % (state["streak"], why))
    for (action,) in actions:
        if action == "detected":
            state["episode"] = {"failing_since": state["failing_since"], "detected_at": now, "probes_failed": state["streak"],
                                "last_error": why, "reload_at": None, "restart_at": None, "recovered_at": None, "rev": 1}
            state["synced"] = {}
            log("the API has been down for %d probes (since %s)" % (state["streak"], ts(state["failing_since"])))
            feed("failed", "The public API has been failing for %d probes (since %s): %s" % (state["streak"], ts(state["failing_since"]), (why or "")[:150]), alert="raise")
        elif action in ("reload", "restart"):
            if not cfg.token:
                log("SUPABASE_ACCESS_TOKEN is not set: cannot %s" % action)
            elif ready_fn(cfg):
                try:
                    sent, detail = (reload_fn if action == "reload" else restart_fn)(cfg)
                except Exception as e:  # noqa: BLE001
                    sent, detail = False, str(e)[:120]
                log("%s sent: %s%s" % (action, "ok" if sent else "FAILED", "" if sent else " (" + detail + ")"))
                if sent or action == "reload":
                    # a reload that errored is not repeated every minute; a restart that errored is offered again next probe
                    state = done(state, action, now, cfg)
                    if sent:
                        touch(state, **{action + "_at": now})
                        feed("warning", "The watchdog sent a %s of the project." % ("schema reload" if action == "reload" else "restart"))
        elif action == "recovered":
            touch(state, recovered_at=now)
            log("the API answers again")
            feed("ok", "The public API answers again.", alert="resolve")
    if ok and not actions:
        feed_beat(state, now)
    ep = state.get("episode")
    if ep and not ok:
        # kept in memory only: written with the next event, not once a minute for the length of an outage
        ep["probes_failed"] = max(ep["probes_failed"], state["streak"])
        ep["last_error"] = why
    if writers:
        sync_record(state, cfg, writers)
    return state


def _feed_module():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import runlog_feed
    return runlog_feed


def feed(outcome, summary, alert=None):
    """An incident, a reload, a restart or a recovery in the run log (scripts/runlog); never raises."""
    try:
        runlog_feed = _feed_module()
        runlog_feed.note("watchdog", "job", outcome, summary, alert=("watchdog:api", alert) if alert else None)
    except Exception:  # noqa: BLE001
        pass


def feed_beat(state, now):
    """One good-probe entry an hour, so the run log can show that the watchdog ran."""
    try:
        runlog_feed = _feed_module()
        runlog_feed.beat(state, "probe", "watchdog", "probes are answering", 3600, now)
    except Exception:  # noqa: BLE001
        pass


def load_state(path):
    try:
        with open(path) as f:
            s = json.load(f)
        base = new_state()
        base.update(s)
        return base
    except (OSError, ValueError):
        return new_state()


def save_state(path, state):
    try:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w") as f:
            json.dump(state, f)
        os.replace(tmp, path)
    except OSError as e:
        log("could not save the state: %s" % e)


def tick(cfg):
    state = load_state(cfg.state_path)
    writers = {"ds1": write_ds1, "prod": lambda sql: write_prod(cfg, sql)} if cfg.token else {"ds1": write_ds1}
    state = run_once(cfg, state, time.time(), writers=writers)
    save_state(cfg.state_path, state)


def main():
    cfg = Config()
    if not cfg.enabled:
        log("switched off (WATCHDOG=0)")
        if "--loop" in sys.argv:
            while True:
                time.sleep(3600)
        return 0
    if "--loop" in sys.argv:
        log("started: probing %s every %d s" % (cfg.base + PROBE_PATH.split("?")[0], cfg.interval))
        while True:
            try:
                tick(cfg)
            except Exception as e:  # noqa: BLE001 - the watchdog must never die
                log("loop error: %s" % str(e)[:200])
            time.sleep(cfg.interval)
    tick(cfg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
