#!/usr/bin/env python3
"""The release hook of the daily job: after a `run.py --apply` that changed a release table, prepare a data release for the tables it touched.

DS1 is the only place data is written; production changes only through data releases that are approved (scripts/release/README.md).
`prepare_release()` runs `python3 -I scripts/release/release.py --by daily-job prepare ...` for the tables the run changed. It never approves.

Two routes, chosen from the tables the run wrote to:
  auto    every table is core.game, meta.verification or meta.data_issue, and DAILY_RELEASE_KIND is set:
          `prepare --kind <DAILY_RELEASE_KIND> --title "Daily scores <date>" --notes ...`, NO --tables (the kind's own default applies).
          The runner approves it by policy after a hold (status, score, overtime and shootout changes only; scripts/release/README.md).
  review  anything else (a new season, team seasons, external ids, sources ... or no DAILY_RELEASE_KIND): a normal publish release,
          `prepare --title "Daily scores <date> (needs review)" --tables <ALL the tables the run wrote to>`. It waits for John.

OFF unless DAILY_PREPARE_RELEASE=1. When it is off, or cannot run (no SUPABASE_ACCESS_TOKEN / DS1 settings), it logs why and returns:
the nightly drift check on the NAS proposes the same change and John approves it there.

  DAILY_PREPARE_RELEASE=1       switch the hook on
  DAILY_RELEASE_KIND=<kind>     the auto route's kind; set it to `daily_scores`. Unset -> every run takes the review route.
  needs, when on:               SUPABASE_ACCESS_TOKEN, and the DS1 settings release.py reads (PGHOST + PGPASSWORD, or SPX_DS1_HOST + PGPASSWORD)

release.py exits 1 for a refusal; "nothing to release" in its output means DS1 and production already match: status `nothing`.
"""
import os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
RELEASE = os.path.abspath(os.path.join(HERE, "..", "release", "release.py"))
BY = "daily-job"
AUTO_TABLES = {"core.game", "meta.verification", "meta.data_issue"}
LEFT = "left to the nightly drift check"


def release_tables(tables):
    """The release tables a run wrote to: {'core.game': {'ins': 1, ...}} -> sorted ['core.game', ...]."""
    return sorted(t for t, n in (tables or {}).items() if t.split(".")[0] in ("core", "meta", "ref") and sum(n.values()) > 0)


def prepare_release(tables, day, summary=None, env=None, release=None):
    """-> dict(status, route, detail, title, tables). status: off | nothing | skipped | prepared | refused | failed. Never raises; never approves.

    `release` is the path of release.py (tests pass a stub)."""
    env = os.environ if env is None else env
    release = release or RELEASE
    names = release_tables(tables)
    kind = env.get("DAILY_RELEASE_KIND") or ""
    route = "auto" if kind and names and set(names) <= AUTO_TABLES else "review"
    title = "Daily scores %s" % day if route == "auto" else "Daily scores %s (needs review)" % day
    out = dict(status="off", route=route, detail="", title=title, tables=names)
    if env.get("DAILY_PREPARE_RELEASE") != "1":
        out["detail"] = "release hook is off (DAILY_PREPARE_RELEASE is not 1): %s" % LEFT
    elif not names:
        out.update(status="nothing", detail="the run changed no release table: no release to prepare")
    elif not env.get("SUPABASE_ACCESS_TOKEN") or not (env.get("PGHOST") or env.get("SPX_DS1_HOST")) or not env.get("PGPASSWORD"):
        out.update(status="skipped", detail="release.py needs SUPABASE_ACCESS_TOKEN, PGHOST (or SPX_DS1_HOST) and PGPASSWORD in the environment: %s" % LEFT)
    elif not os.path.exists(release):
        out.update(status="skipped", detail="scripts/release/release.py not found: %s" % LEFT)
    else:
        n = (summary or {}).get("games_changed", 0) or 0
        notes = "Prepared by the daily scores job (scripts/daily): %d game(s) changed. Tables: %s." % (n, ", ".join(names))
        cmd = [sys.executable, "-I", release, "--by", BY, "prepare"]
        if route == "auto": cmd += ["--kind", kind, "--title", title, "--notes", notes]
        else: cmd += ["--title", title, "--tables", ",".join(names), "--notes", notes]
        try:
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=900, env=dict(env))
            text = scrub((p.stdout + p.stderr).strip(), env)
            tail = " | ".join(text.splitlines()[-3:])[:400]
            if p.returncode == 0: status = "prepared"
            elif p.returncode == 1 and "nothing to release" in text.lower(): status = "nothing"
            else: status = "refused" if p.returncode == 1 else "failed"
            after = {"prepared": "waiting for approval" if route == "review" else "waiting for the hold and the automatic checks",
                     "nothing": "DS1 and production already match"}.get(status, LEFT)
            out.update(status=status, detail="release.py prepare (%s route) exit %d: %s; %s" % (route, p.returncode, tail, after))
        except Exception as e:
            out.update(status="failed", detail="release.py prepare could not run (%s): %s" % (scrub(e, env), LEFT))
    print("release hook: %s: %s" % (out["status"], out["detail"]))
    return out


def scrub(text, env):
    text = str(text)
    for name in ("SUPABASE_ACCESS_TOKEN", "PGPASSWORD"):
        if env.get(name): text = text.replace(env[name], "***")
    return text
