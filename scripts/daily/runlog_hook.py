#!/usr/bin/env python3
"""The daily job's entry in the run log (scripts/runlog): one run, one item per league, and the admin alerts.

A league that failed raises the alert `daily:<league>` (cleared by that league's next success); a league that saved but left something out
(a club, a game) raises a warning alert `daily-left-out:<league>`. A crash of the whole run raises `daily:run`. Never raises, never fails the job.
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "runlog"))
try:
    import runlog
except Exception:          # the log must never stop the job
    runlog = None
JOB = "daily-scores"


def start():
    try:
        return runlog.Run(JOB, "job").start("daily scores run started") if runlog else None
    except Exception:
        return None


def report(rl, result, rc, error=None):
    """Close the run: rl is what start() returned, result the heartbeat's summary dict, rc the exit code, error a crash message."""
    if rl is None or runlog is None:
        return
    try:
        lrs = (result or {}).get("league_results") or {}
        for lg, x in lrs.items():
            counts = {k: x.get(k) for k in ("games_changed", "games_skipped") if x.get(k) is not None}
            if x.get("clubs_skipped"):
                counts["clubs_skipped"] = len(x["clubs_skipped"])
            detail = {k: x[k] for k in ("reason", "clubs_skipped", "games_unreadable") if x.get(k)}
            rl.item(lg, x.get("outcome"), x.get("reason") or ("%s games changed" % x.get("games_changed", 0) if x.get("committed") else x.get("outcome")), counts or None, detail or None)
        failed = [lg for lg, x in lrs.items() if x.get("outcome") == "failed"]
        warned = [lg for lg, x in lrs.items() if x.get("outcome") == "warning"]
        if error:
            outcome, summary = "failed", "the run stopped: " + error[:300]
        elif failed:
            outcome, summary = "failed", "failed: %s; saved: %s" % (", ".join(l.upper() for l in failed), ", ".join(l.upper() for l, x in lrs.items() if x.get("outcome") in ("ok", "warning")) or "none")
        elif warned:
            outcome, summary = "warning", "saved, with games or clubs left out in %s" % ", ".join(l.upper() for l in warned)
        elif rc != 0:
            outcome, summary = "failed", "exit code %d" % rc
        else:
            n = sum(1 for x in lrs.values() if x.get("outcome") == "ok")
            outcome, summary = "ok", "%d league(s) saved, %d game(s) changed" % (n, (result.get("load") or {}).get("games_changed", 0) or 0) if lrs else "nothing to save"
        links = {"release": (result.get("release") or {}).get("title")} if (result or {}).get("release") else None
        counts = {"games_skipped": (result or {}).get("games_skipped", 0), "wikipedia_requests": (result or {}).get("wikipedia_requests"), "other_requests": (result or {}).get("other_requests")}
        rl.finish(outcome, summary, {k: v for k, v in counts.items() if v is not None}, {"league_results": lrs} if lrs else None, links)
        for lg, x in lrs.items():
            if x.get("outcome") == "failed":
                runlog.alert_raise("daily:%s" % lg, JOB, lg, "%s scores did not update: %s" % (lg.upper(), (x.get("reason") or "failed")[:300]))
            elif x.get("outcome") in ("ok", "warning"):
                runlog.alert_resolve("daily:%s" % lg)
            if x.get("outcome") == "warning":
                runlog.alert_raise("daily-left-out:%s" % lg, JOB, lg, "%s: %s" % (lg.upper(), x.get("reason") or "something was left out"), severity="warning")
            elif x.get("outcome") == "ok":
                runlog.alert_resolve("daily-left-out:%s" % lg)
        if error:
            runlog.alert_raise("daily:run", JOB, None, "The daily scores run stopped: " + error[:300])
        elif lrs:
            runlog.alert_resolve("daily:run")
    except Exception:
        pass
