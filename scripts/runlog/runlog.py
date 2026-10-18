#!/usr/bin/env python3
"""The run log: one small append-only writer that every automated job and every deploy calls, into Turso (libSQL over HTTPS).

Why Turso: the log grows every day; production (Supabase Free) is nearly full and Turso has room (AGENTS.md section 8, "Turso"). The site reads it
(web/src/lib/runlog, page /admin/runs) with the read token; jobs write with the write token. DS1's own heartbeat tables (ingest.daily_run,
ingest.raw_export_run, meta.ops_status) keep working and feed it.

A failed write NEVER fails the caller: every public function catches everything and returns None / False. An entry that cannot be written
(no Turso configured, the network is down) goes to a spool file and is sent with the next write that works.

    import runlog
    rl = runlog.Run("daily-scores", kind="job")          # kinds: job | data | release | approval | deploy | ops
    rl.start("run started")                              # optional: shows the run as 'running' (a run that dies stays 'running')
    rl.item("nhl", "ok", "12 games changed", counts={"games": 12})
    rl.finish("ok", "5 leagues ok", counts={...}, detail={...}, links={"release": "2026.10.18-1"})
    runlog.event("raw-export", "job", "ok", "17 files copied")                       # one entry, start and finish together
    runlog.alert_raise("daily:mlb", "daily-scores", "mlb", "MLB failed: a check ...")   # a banner on every admin page until dismissed
    runlog.alert_resolve("daily:mlb")                                                 # the job's next success; stays shown until dismissed

Shell: python3 -I scripts/runlog/runlog.py event --job deploy-prebuilt --kind deploy --outcome ok --summary "deployed abc1234" [--alert-key k]

Environment (names only): TURSO_DATABASE_URL (libsql://, https:// or http://127.0.0.1:<port> for a test server) and TURSO_RUNLOG_TOKEN (a token
that can write; TURSO_AUTH_TOKEN is used when it is not set). For the shell scripts on a Mac (log.sh sets RUNLOG_KEYCHAIN=1) the keychain items `spx-stats TURSO_DATABASE_URL` and
`spx-stats TURSO_RUNLOG_TOKEN` are read when the variables are missing. RUNLOG=0 switches the log off. RUNLOG_SPOOL overrides the spool file.
Standard library only. Tokens are never printed or stored.
"""
import datetime
import json
import os
import socket
import subprocess
import sys
import urllib.error
import urllib.request
import uuid

TIMEOUT = 10
KINDS = ("job", "data", "release", "approval", "deploy", "ops")
OUTCOMES = ("running", "ok", "warning", "failed", "skipped")
DETAIL_DAYS = 90
SUMMARY_DAYS = 365

SCHEMA = [
    "create table if not exists run_log (id integer primary key autoincrement, uid text not null unique, kind text not null, job text not null, scope text, actor text, "
    "host text, ref text, started_at text not null, finished_at text, outcome text not null, summary text, counts text, detail text, links text)",
    "create index if not exists run_log_started on run_log (started_at)",
    "create index if not exists run_log_job on run_log (job, started_at)",
    "create table if not exists run_log_item (id integer primary key autoincrement, run_uid text not null, seq integer not null, name text not null, outcome text, "
    "summary text, counts text, detail text, at text, unique (run_uid, seq))",
    "create index if not exists run_log_item_run on run_log_item (run_uid)",
    "create table if not exists alert (id integer primary key autoincrement, key text not null unique, job text not null, scope text, severity text not null default 'error', "
    "message text not null, first_at text not null, last_at text not null, repeats integer not null default 1, state text not null default 'open', resolved_at text, "
    "dismissed_at text, dismissed_by text, run_uid text)",
    "create table if not exists run_meta (key text primary key, value text)",
]
_schema_done = False


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def ago(days):
    return (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")


def _keychain(name):
    if sys.platform != "darwin" or os.environ.get("RUNLOG_KEYCHAIN") != "1":
        return ""
    try:
        p = subprocess.run(["security", "find-generic-password", "-s", name, "-w"], capture_output=True, text=True, timeout=10)
        return p.stdout.strip() if p.returncode == 0 else ""
    except Exception:
        return ""


def config():
    """-> (endpoint, token) or None when the log is off or not configured."""
    if os.environ.get("RUNLOG") == "0":
        return None
    url = (os.environ.get("TURSO_DATABASE_URL") or _keychain("spx-stats TURSO_DATABASE_URL")).strip()
    token = (os.environ.get("TURSO_RUNLOG_TOKEN") or os.environ.get("TURSO_AUTH_TOKEN") or _keychain("spx-stats TURSO_RUNLOG_TOKEN")).strip()
    if not url:
        return None
    return url.replace("libsql://", "https://").rstrip("/") + "/v2/pipeline", token


def _arg(v):
    if v is None:
        return {"type": "null"}
    if isinstance(v, bool):
        return {"type": "integer", "value": str(int(v))}
    if isinstance(v, int):
        return {"type": "integer", "value": str(v)}
    if isinstance(v, float):
        return {"type": "float", "value": v}
    return {"type": "text", "value": str(v)}


def _js(v):
    return None if v is None else json.dumps(v, ensure_ascii=False, default=str, separators=(",", ":"))


def spool_path():
    return os.environ.get("RUNLOG_SPOOL") or os.path.join(os.environ.get("XDG_CACHE_HOME") or os.path.expanduser("~/.cache"), "spx-runlog", "pending.jsonl")


def _send(statements):
    """Send [(sql, args)] as one pipeline. Raises on any failure (callers catch). -> the list of result dicts."""
    cfg = config()
    if cfg is None:
        raise RuntimeError("the run log is not configured (TURSO_DATABASE_URL)")
    endpoint, token = cfg
    body = json.dumps({"requests": [{"type": "execute", "stmt": {"sql": s, "args": [_arg(a) for a in args]}} for s, args in statements] + [{"type": "close"}]}).encode()
    req = urllib.request.Request(endpoint, data=body, headers={"content-type": "application/json", **({"authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError("turso answered %d" % e.code)
    out = []
    for res in data.get("results", []):
        if res.get("type") == "error":
            raise RuntimeError("turso: " + str((res.get("error") or {}).get("message", "error"))[:200])
        if res.get("type") == "ok" and res["response"].get("type") == "execute":
            out.append(res["response"]["result"])
    return out


def _ensure():
    global _schema_done
    if not _schema_done:
        _send([(s, []) for s in SCHEMA])
        _schema_done = True


def _spool(statements):
    try:
        path = spool_path()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps([[s, a] for s, a in statements]) + "\n")
        size = os.path.getsize(path)
        if size > 2_000_000:         # never grow without bound: drop the oldest half
            lines = open(path, encoding="utf-8").read().splitlines()
            open(path, "w", encoding="utf-8").write("\n".join(lines[len(lines) // 2:]) + "\n")
    except Exception:
        pass


def _flush():
    """Send what an earlier failed write spooled (each line is a self-contained pipeline)."""
    path = spool_path()
    if not os.path.exists(path):
        return
    try:
        lines = open(path, encoding="utf-8").read().splitlines()
        left = []
        for i, ln in enumerate(lines):
            try:
                _send([(s, a) for s, a in json.loads(ln)])
            except Exception:
                left = lines[i:]
                break
        if left:
            open(path, "w", encoding="utf-8").write("\n".join(left) + "\n")
        else:
            os.remove(path)
    except Exception:
        pass


def write(statements):
    """Send the statements (schema first, the spool before them); on failure spool them. Never raises. -> True when written."""
    if config() is None:       # off, or nothing to write to (a laptop with no Turso settings): nothing to spool for
        return False
    try:
        _ensure()
        _flush()
        _send(statements)
        return True
    except Exception as e:
        _spool(statements)
        print("runlog: not written (%s)" % str(e)[:120], file=sys.stderr)
        return False


def _row(uid, kind, job, scope, actor, host, ref, started, finished, outcome, summary, counts, detail, links):
    return ("insert into run_log (uid, kind, job, scope, actor, host, ref, started_at, finished_at, outcome, summary, counts, detail, links) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?) "
            "on conflict (uid) do update set finished_at = excluded.finished_at, outcome = excluded.outcome, summary = excluded.summary, counts = excluded.counts, "
            "detail = excluded.detail, links = excluded.links, ref = coalesce(excluded.ref, run_log.ref)",
            [uid, kind, job, scope, actor, host, ref, started, finished, outcome, (summary or "")[:500], _js(counts), _js(detail), _js(links)])


def _item(uid, seq, name, outcome, summary, counts, detail):
    return ("insert or ignore into run_log_item (run_uid, seq, name, outcome, summary, counts, detail, at) values (?,?,?,?,?,?,?,?)",
            [uid, seq, name, outcome, (summary or "")[:500], _js(counts), _js(detail), now()])


class Run:
    """One entry of the log. start() is optional; finish() always writes the whole entry, so a run whose start was lost still appears."""

    def __init__(self, job, kind="job", scope=None, actor=None, ref=None):
        self.uid = uuid.uuid4().hex
        self.job, self.kind, self.scope, self.actor, self.ref = job, kind if kind in KINDS else "job", scope, actor, ref
        self.host = (os.environ.get("RUNLOG_HOST") or "")[:60] or None   # machines are named by role, never by host name (AGENTS.md section 1)
        self.started = now()
        self.items = []

    def start(self, summary="started"):
        try:
            write([_row(self.uid, self.kind, self.job, self.scope, self.actor, self.host, self.ref, self.started, None, "running", summary, None, None, None)])
        except Exception:
            pass
        return self

    def item(self, name, outcome=None, summary=None, counts=None, detail=None):
        self.items.append((name, outcome, summary, counts, detail))

    def finish(self, outcome, summary="", counts=None, detail=None, links=None):
        try:
            outcome = outcome if outcome in OUTCOMES else "failed"
            st = [_row(self.uid, self.kind, self.job, self.scope, self.actor, self.host, self.ref, self.started, now(), outcome, summary, counts, detail, links)]
            st += [_item(self.uid, i, *it) for i, it in enumerate(self.items)]
            ok = write(st)
            if ok:
                _prune()
            return ok
        except Exception:
            return False


def event(job, kind, outcome, summary="", counts=None, detail=None, links=None, scope=None, actor=None, ref=None, items=(), started=None):
    """One finished entry in a single call (a deploy, an approval, an apply). Never raises."""
    try:
        r = Run(job, kind, scope, actor, ref)
        if started:
            r.started = started
        for it in items:
            r.item(*it)
        return r.finish(outcome, summary, counts, detail, links)
    except Exception:
        return False


def alert_raise(key, job, scope, message, severity="error", run_uid=None):
    """Raise (or raise again) an alert. A repeat failure after a dismissal opens it again."""
    try:
        t = now()
        return write([("insert into alert (key, job, scope, severity, message, first_at, last_at, repeats, state, run_uid) values (?,?,?,?,?,?,?,1,'open',?) "
                       "on conflict (key) do update set message = excluded.message, severity = excluded.severity, last_at = excluded.last_at, repeats = alert.repeats + 1, "
                       "state = 'open', resolved_at = null, dismissed_at = null, dismissed_by = null, run_uid = excluded.run_uid",
                       [key, job, scope, severity, (message or "")[:500], t, t, run_uid])])
    except Exception:
        return False


def alert_resolve(key):
    """The job's next success: the alert stops counting as open but stays shown until an admin dismisses it."""
    try:
        return write([("update alert set state = 'resolved', resolved_at = ? where key = ? and state = 'open'", [now(), key])])
    except Exception:
        return False


def _prune():
    """Retention, at most once a day: item and run detail 90 days, the one-line entry a year, dismissed resolved alerts 90 days."""
    try:
        res = _send([("select value from run_meta where key = 'pruned_at'", [])])
        rows = res[0]["rows"] if res else []
        last = rows[0][0].get("value") if rows and rows[0][0].get("type") == "text" else None
        if last and last > ago(1):
            return
        _send([("update run_log set detail = null where started_at < ? and detail is not null", [ago(DETAIL_DAYS)]),
               ("delete from run_log_item where at < ?", [ago(DETAIL_DAYS)]),
               ("delete from run_log where started_at < ?", [ago(SUMMARY_DAYS)]),
               ("delete from alert where state = 'resolved' and dismissed_at is not null and last_at < ?", [ago(DETAIL_DAYS)]),
               ("insert into run_meta (key, value) values ('pruned_at', ?) on conflict (key) do update set value = excluded.value", [now()])])
    except Exception:
        pass


def main(argv):
    import argparse
    ap = argparse.ArgumentParser(description="write one entry to the run log (never fails: exit 0 whatever happens)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("event")
    e.add_argument("--job", required=True)
    e.add_argument("--kind", default="job")
    e.add_argument("--outcome", required=True)
    e.add_argument("--summary", default="")
    e.add_argument("--scope")
    e.add_argument("--actor")
    e.add_argument("--ref")
    e.add_argument("--started")
    e.add_argument("--counts-json")
    e.add_argument("--detail-json")
    e.add_argument("--links-json")
    e.add_argument("--alert-key", help="a failed outcome raises this alert, an ok one resolves it")
    r = sub.add_parser("alert-raise")
    r.add_argument("--key", required=True)
    r.add_argument("--job", required=True)
    r.add_argument("--scope")
    r.add_argument("--message", required=True)
    s = sub.add_parser("alert-resolve")
    s.add_argument("--key", required=True)
    a = ap.parse_args(argv)
    try:
        if a.cmd == "event":
            load = lambda t: json.loads(t) if t else None
            event(a.job, a.kind, a.outcome, a.summary, load(a.counts_json), load(a.detail_json), load(a.links_json), a.scope, a.actor, a.ref, started=a.started)
            if a.alert_key:
                if a.outcome == "failed":
                    alert_raise(a.alert_key, a.job, a.scope, a.summary or "%s failed" % a.job)
                elif a.outcome == "ok":
                    alert_resolve(a.alert_key)
        elif a.cmd == "alert-raise":
            alert_raise(a.key, a.job, a.scope, a.message)
        else:
            alert_resolve(a.key)
    except Exception as ex:
        print("runlog: %s" % str(ex)[:120], file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
