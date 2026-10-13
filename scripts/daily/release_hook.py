#!/usr/bin/env python3
"""The release hook of the daily job: after a `run.py --apply` that changed a release table, prepare a data release for the tables it touched.

DS1 is the only place data is written; production changes only through data releases that are approved (scripts/release/README.md).
`prepare_release()` runs `python3 -I scripts/release/release.py prepare` for the tables the run changed. It does not approve anything.

OFF unless DAILY_PREPARE_RELEASE=1. When it is off, or cannot run (no SUPABASE_ACCESS_TOKEN / DS1 settings), it logs why and returns:
the nightly drift check on the NAS proposes the same change and John approves it there.

  DAILY_PREPARE_RELEASE=1     switch the hook on
  DAILY_RELEASE_KIND=<kind>   passed as `--kind <kind>` to release.py prepare; unset -> the flag is left out (a plain publish release).
                              Set it to `daily_scores` once the release side has that kind. If the release side names the option
                              differently, change KIND_OPTION below: it is the only place the flag is built.
  needs, when on:             SUPABASE_ACCESS_TOKEN, and the DS1 settings release.py reads (PGHOST + PGPASSWORD, or SPX_DS1_HOST + PGPASSWORD)
"""
import os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
RELEASE = os.path.abspath(os.path.join(HERE, "..", "release", "release.py"))
KIND_OPTION = "--kind"          # release.py prepare --kind <DAILY_RELEASE_KIND>
LEFT = "left to the nightly drift check"


def release_tables(tables):
    """The release tables a run wrote to: {'core.game': {'ins': 1, ...}} -> sorted ['core.game', ...]."""
    return sorted(t for t, n in (tables or {}).items() if t.split(".")[0] in ("core", "meta", "ref") and sum(n.values()) > 0)


def prepare_release(tables, day, summary=None, env=None):
    """-> dict(status, detail, title, tables). status: off | nothing | skipped | prepared | refused | failed. Never raises; never approves."""
    env = os.environ if env is None else env
    names = release_tables(tables)
    title = "Daily scores %s" % day
    out = dict(status="off", detail="", title=title, tables=names)
    if env.get("DAILY_PREPARE_RELEASE") != "1":
        out["detail"] = "release hook is off (DAILY_PREPARE_RELEASE is not 1): %s" % LEFT
    elif not names:
        out.update(status="nothing", detail="the run changed no release table: no release to prepare")
    elif not env.get("SUPABASE_ACCESS_TOKEN") or not (env.get("PGHOST") or env.get("SPX_DS1_HOST")) or not env.get("PGPASSWORD"):
        out.update(status="skipped", detail="release.py needs SUPABASE_ACCESS_TOKEN, PGHOST (or SPX_DS1_HOST) and PGPASSWORD in the environment: %s" % LEFT)
    elif not os.path.exists(RELEASE):
        out.update(status="skipped", detail="scripts/release/release.py not found: %s" % LEFT)
    else:
        n = (summary or {}).get("games_changed", 0) or 0
        notes = "Prepared by the daily scores job (scripts/daily): %d game(s) changed. Tables: %s." % (n, ", ".join(names))
        cmd = [sys.executable, "-I", RELEASE, "--by", "daily scores", "prepare", "--title", title, "--tables", ",".join(names), "--notes", notes]
        if env.get("DAILY_RELEASE_KIND"): cmd += [KIND_OPTION, env["DAILY_RELEASE_KIND"]]
        try:
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=900, env=dict(env))
            text = scrub((p.stdout + p.stderr).strip(), env)
            tail = " | ".join(text.splitlines()[-3:])[:400]
            out.update(status={0: "prepared", 1: "refused"}.get(p.returncode, "failed"), detail="release.py prepare exit %d: %s; %s" % (p.returncode, tail, LEFT if p.returncode else "waiting for approval"))
        except Exception as e:
            out.update(status="failed", detail="release.py prepare could not run (%s): %s" % (scrub(e, env), LEFT))
    print("release hook: %s: %s" % (out["status"], out["detail"]))
    return out


def scrub(text, env):
    text = str(text)
    for name in ("SUPABASE_ACCESS_TOKEN", "PGPASSWORD"):
        if env.get(name): text = text.replace(env[name], "***")
    return text
