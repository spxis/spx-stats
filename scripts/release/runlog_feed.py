#!/usr/bin/env python3
"""What the release runner's own pieces (release.py, watchdog.py, ops.py) tell the run log (scripts/runlog). Every function swallows every error:
a failed log write never fails a release, a probe or a snapshot.

  note(job, kind, outcome, summary, ...)          one entry
  alert(key, "raise"|"resolve", scope, message)   one alert, no entry
  beat(state, key, job, summary, every)           one "ok" entry at most every `every` seconds (a watchdog that probes every minute logs hourly)
  feed_raw_export(ds1_json, state)                the rows the Dropbox export left in ingest.raw_export_run since the last tick -> entries + alert
"""
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "runlog"))
try:
    import runlog
except Exception:
    runlog = None


def note(job, kind, outcome, summary, counts=None, detail=None, links=None, actor=None, ref=None, scope=None, alert=None, started=None):
    """One finished entry. `alert=(key, "raise"|"resolve")` also raises or resolves that alert."""
    if runlog is None:
        return False
    try:
        ok = runlog.event(job, kind, outcome, summary, counts, detail, links, scope, actor, ref, started=started)
        if alert:
            key, what = alert
            if what == "raise":
                runlog.alert_raise(key, job, scope, summary)
            else:
                runlog.alert_resolve(key)
        return ok
    except Exception:
        return False


def alert(key, what, scope=None, message="", severity="error", job="daily-scores"):
    """Raise or resolve one alert (what: "raise" | "resolve") without a run log entry. Never raises. -> True when it was written."""
    if runlog is None:
        return False
    try:
        if what == "raise":
            return bool(runlog.alert_raise(key, job, scope, message, severity))
        return bool(runlog.alert_resolve(key))
    except Exception:
        return False


def beat(state, key, job, summary, every=3600, now=None, kind="job", counts=None):
    """-> True when an entry was written. `state` is the caller's own dict (kept in its state file)."""
    try:
        now = now or time.time()
        if now - (state.get("rl_" + key) or 0) < every:
            return False
        state["rl_" + key] = now
        return note(job, kind, "ok", summary, counts)
    except Exception:
        return False


def feed_raw_export(read_json, state):
    """read_json(sql) -> parsed json from DS1. New raw_export_run rows (the Mac's hourly Dropbox export) become entries; a run with problems
    raises the alert `raw-export`, a good run resolves it. The first call only remembers where the table stands."""
    if runlog is None:
        return
    try:
        if state.get("rl_export_id") is None:
            # first sight: do not replay history; start from the newest row
            state["rl_export_id"] = int(read_json("select coalesce(max(id), 0) from ingest.raw_export_run") or 0)
            return
        rows = read_json("select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]'::jsonb) from (select id, host, finished_at, outcome, checked, copied, present, failed, bytes, seconds "
                         "from ingest.raw_export_run where id > %d order by id limit 50) e" % int(state["rl_export_id"])) or []
        for r in rows:
            bad = r.get("outcome") != "ok"
            fin = r.get("finished_at")
            note("raw-export", "job", "warning" if bad else "ok",
                 "%s files checked, %s copied, %s already there%s" % (r.get("checked"), r.get("copied"), r.get("present"), (", %s problem(s)" % r.get("failed")) if bad else ""),
                 counts={k: r.get(k) for k in ("checked", "copied", "present", "failed", "bytes", "seconds")},
                 detail={"host": r.get("host"), "finished_at": fin}, actor=r.get("host"),
                 alert=("raw-export", "raise" if bad else "resolve"))
            state["rl_export_id"] = max(int(state.get("rl_export_id") or 0), int(r["id"]))
    except Exception:
        pass


# ---------------------------------------------------------------------------------------------------- releases (release.py)

def _totals(rel):
    """{'add': n, 'change': n, 'remove': n} from a release row's preview, or None."""
    try:
        pv = rel.get("preview") or {}
        if isinstance(pv, str):
            import json
            pv = json.loads(pv)
        return {k: v for k, v in (pv.get("totals") or {}).items() if isinstance(v, (int, float))} or None
    except Exception:
        return None


def release_event(stage, rel, outcome, summary, actor=None, detail=None, alert=None):
    """stage: prepare | approve | reject | withdraw | auto-approve | apply | drift-fix. `rel` is a DS1 meta.data_release row (a dict).
    Approvals and rejections are kind 'approval', the rest kind 'release'. Never raises."""
    try:
        tables = rel.get("tables")
        if isinstance(tables, str):
            tables = [t for t in tables.strip("{}").split(",") if t]
        d = {"release": rel.get("number"), "title": rel.get("title"), "release_kind": rel.get("kind"), "tables": tables, "totals": _totals(rel),
             "approved_by": rel.get("approved_by"), "approved_at": str(rel.get("approved_at") or "") or None}
        pv = rel.get("preview") or {}
        if isinstance(pv, dict):
            d["blockers"] = pv.get("blockers") or None
            d["warnings"] = pv.get("warnings") or None
            d["auto"] = pv.get("auto") or None
        d.update(detail or {})
        d = {k: v for k, v in d.items() if v not in (None, [], {})}
        kind = "approval" if stage in ("approve", "reject", "auto-approve") else "release"
        return note("release-" + stage, kind, outcome, summary, counts=_totals(rel), detail=d, links={"release": rel.get("number")}, actor=actor,
                    scope=rel.get("number"), alert=alert)
    except Exception:
        return False
