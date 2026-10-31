#!/usr/bin/env python3
"""What the harvest job is doing, in one screen (read-only).

  python3 -I scripts/harvest/status.py            queue depth by kind and state, gap targets left by kind and league, pages archived today, bytes, last error,
                                                  estimated growth per day, the heartbeat
  python3 -I scripts/harvest/status.py --measure  also measure the gaps in core now (team seasons with no roster, seasons with no awards, ...); a few seconds more
  python3 -I scripts/harvest/status.py --json     the raw numbers

On a Mac it reaches DS1 through scripts/daily/ds1.sh (keychain); in the container through PGHOST/PGPASSWORD. The same numbers: select ingest.harvest_progress();
"""
import json
import os
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import db  # noqa: E402
import planner  # noqa: E402
from config import Config  # noqa: E402

# raw bytes archived per item when there is no history yet (measured 2026-10-14 on real articles; Wikidata items are pruned before archiving)
DEFAULT_BYTES = {"wp_team_season": 70_000, "wp_league_season": 170_000, "wp_draft": 100_000, "wd_team_members": 150_000, "wd_person": 2_500, "wd_label": 800,
                 "wp_playoffs": 55_000, "wp_list": 30_000}      # measured 2026-10-31 on the titles themselves (prop=info length): 46.5 MB for 1,247 pages
STORED_FRACTION = 0.45      # bytea is compressed by the database; the parsed rows add to it, so about this share of the raw bytes lands on DS1 (to be checked against real growth)


def team_page_state(page_version, job_state, target_planned=False):
    """Explain why a team-season is or is not in the next queue plan."""
    if page_version is not None:
        if int(page_version) >= planner.PARSER_VERSION:
            return "current_archive"
        return "stale_%s" % (job_state or "not_queued")
    if job_state:
        return "no_archive_%s" % job_state
    return "new_target" if target_planned else "not_a_gap"


def mb(n):
    return "%.1f MB" % (n / 1e6)


def table(rows, head):
    w = [max(len(str(x)) for x in col) for col in zip(head, *rows)] if rows else [len(h) for h in head]
    line = lambda r: "  ".join(str(x).ljust(w[i]) if i == 0 else str(x).rjust(w[i]) for i, x in enumerate(r))
    return "\n".join([line(head)] + [line(r) for r in rows])


def measure():
    """Gaps in core right now, from the planner's own queries."""
    ts = db.rows(planner.team_seasons_sql(planner.have_rosters()))
    se = db.rows(planner.SEASONS)
    dr = db.rows(planner.DRAFTS)
    pages = {r["title"]: int(r["parser_version"]) for r in db.rows(planner.TEAM_PAGE_STATE_SQL)}
    team_jobs = {r["target"]: r["state"] for r in db.rows(planner.TEAM_JOB_STATE_SQL)}
    planned = planner.build_targets(Config(), datetime.now(timezone.utc), ts, [], [], [], team_pages=pages, team_jobs=team_jobs)
    planned_team_titles = {t["target"] for t in planned if t["kind"] == "wp_team_season"}
    team_articles = {}
    team_states = {}
    team_actionability = {}
    for item in planned:
        if item["kind"] == "wp_team_season":
            team_articles[item["league"]] = team_articles.get(item["league"], 0) + 1
    for r in ts:
        lg, y = r["league"], int(r["season"])
        if not r["name"]:
            state = "no_name"
        else:
            title = planner.team_title(lg, y, r["name"])
            page_version, job_state = pages.get(title), team_jobs.get(title)
            state = team_page_state(page_version, job_state, title in planned_team_titles)
        by_state = team_states.setdefault(lg, {})
        by_state[state] = by_state.get(state, 0) + 1
        bucket = team_actionability.setdefault(lg, {"new_targets": 0, "done_requeues": 0, "already_queued": 0,
                                                     "running": 0, "gone_waiting": 0, "failed_waiting": 0, "stale_unqueued": 0})
        if state == "new_target":
            bucket["new_targets"] += 1
        elif state in ("stale_done", "no_archive_done"):
            bucket["done_requeues"] += 1
        elif state in ("stale_queued", "no_archive_queued"):
            bucket["already_queued"] += 1
        elif state in ("stale_running", "no_archive_running"):
            bucket["running"] += 1
        elif state in ("stale_gone", "no_archive_gone"):
            bucket["gone_waiting"] += 1
        elif state in ("stale_failed", "no_archive_failed"):
            bucket["failed_waiting"] += 1
        elif state in ("stale_not_queued", "no_archive_not_queued"):
            bucket["stale_unqueued"] += 1
    out = {}
    for lg in planner.TEAM_LEAGUES:
        t = [r for r in ts if r["league"] == lg]
        out[lg] = {"team_seasons": len(t), "no_name": sum(1 for r in t if not r["name"]),
                   "no_roster": sum(1 for r in t if r["no_roster"]), "no_team_stat": sum(1 for r in t if r["no_stat"]),
                   "seasons_no_awards": sum(1 for r in se if r["league"] == lg and r["no_awards"]),
                   "draft_years_no_picks": sum(1 for r in dr if r["league"] == lg and r["no_draft"] and int(r["year"]) >= planner.DRAFT_FROM[lg]) if lg in planner.DRAFT_FROM else 0,
                   "team_articles_to_plan": team_articles.get(lg, 0),
                   "team_articles_estimated_raw_bytes": team_articles.get(lg, 0) * DEFAULT_BYTES["wp_team_season"],
                   "team_page_states": team_states.get(lg, {}), "team_actionability": team_actionability.get(lg, {})}
    people = db.value("select count(*) from core.external_id x join core.person p on p.person_id = x.entity_id where x.entity_kind = 'person' "
                      "and x.source_id = (select source_id from meta.source where code = 'wikidata') and (%s)" % planner.PERSON_MISSING)
    out["people_missing_facts"] = people
    out["team_articles_to_plan"] = sum(team_articles.values())
    out["team_articles_estimated_raw_bytes"] = out["team_articles_to_plan"] * DEFAULT_BYTES["wp_team_season"]
    out["team_articles_actionable"] = sum(v.get("new_targets", 0) + v.get("done_requeues", 0) + v.get("stale_unqueued", 0)
                                          for v in team_actionability.values())
    out["team_articles_already_queued"] = sum(v.get("already_queued", 0) for v in team_actionability.values())
    out["team_articles_estimated_raw_bytes_actionable"] = out["team_articles_actionable"] * DEFAULT_BYTES["wp_team_season"]
    return out


def estimate(prog):
    """Bytes per day archived (last 7 days), and the raw size of the gap queue still to read."""
    days = prog.get("per_day") or []
    per_day = sum(d["bytes"] or 0 for d in days) / max(1, len(days))
    left = {}
    for g in prog.get("gap_left") or []:
        left[g["kind"]] = left.get(g["kind"], 0) + g["n"]
    queue_bytes = sum(n * DEFAULT_BYTES.get(k, 50_000) for k, n in left.items())
    return per_day, queue_bytes, left


def render(prog, gaps=None, now=None):
    now = now or datetime.now(timezone.utc)
    out = []
    lr = prog.get("last_run")
    if lr:
        beat = datetime.fromisoformat(lr["last_beat_at"].replace("Z", "+00:00"))
        age = int((now - beat).total_seconds())
        s = lr.get("summary") or {}
        out.append("worker: run %s on %s, %s, last heartbeat %ds ago%s%s" % (lr["run_id"], lr.get("host"), lr["outcome"], age,
                   "  (STALE: no heartbeat for over 15 minutes)" if lr["outcome"] == "running" and age > 900 else "",
                   ("  paused %ds" % s["paused_secs"]) if s.get("paused_secs") else ""))
    else:
        out.append("worker: no run recorded yet")
    q = prog.get("queue") or []
    kinds = sorted({r["kind"] for r in q})
    states = ["queued", "running", "done", "failed", "gone"]
    rows = []
    for k in kinds:
        by = {r["state"]: r["n"] for r in q if r["kind"] == k}
        rows.append([k] + [by.get(s, 0) for s in states] + [sum(by.values())])
    out += ["", "queue depth", table(rows, ["kind"] + states + ["total"]) if rows else "  (empty: run `harvest.py plan`)"]
    g = prog.get("gap_left") or []
    rows = [[r["kind"], r["league"], r["n"]] for r in g]
    out += ["", "gap targets left (nothing in DS1 yet; queued, running or failed and waiting)", table(rows, ["kind", "league", "left"]) if rows else "  none: the gap queue is drained"]
    t = prog.get("today") or {}
    out += ["", "today: %s requests, %s received, %s pages or items archived" % (t.get("requests", 0), mb(t.get("bytes", 0)), t.get("archived", 0))]
    pd, qb, left = estimate(prog)
    out.append("growth: about %s a day received over the last %d days; archive plus parsed rows on DS1 about %s a day"
               % (mb(pd), len(prog.get("per_day") or []), mb(pd * STORED_FRACTION)))
    if qb:
        out.append("gap queue still to read: about %s raw, about %s on DS1 (%s)" % (mb(qb), mb(qb * STORED_FRACTION), ", ".join("%s %d" % kv for kv in sorted(left.items()))))
    le = prog.get("last_error")
    out.append("last error: " + ("%s %s at %s: %s" % (le["kind"], le["target"], le["at"][:19], le["error"]) if le else "none"))
    if gaps:
        rows = [[lg, v["team_seasons"], v["no_name"], v["no_roster"], v["no_team_stat"], v["team_articles_to_plan"],
                 v["team_actionability"], v["team_page_states"], v["seasons_no_awards"], v["draft_years_no_picks"]]
                for lg, v in gaps.items() if lg in planner.TEAM_LEAGUES]
        out += ["", "gaps in core now (read-only measure; they close when a db/build step reads what the harvest filled)",
                table(rows, ["league", "team seasons", "no name", "no roster", "no team stats", "selected", "actionability", "page/job states", "no awards", "no draft"]),
                "new/done-requeue/stale-unqueued are actionable; queued is counted separately. Estimate: %s raw per selected team-season page, %s raw actionable."
                % (mb(DEFAULT_BYTES["wp_team_season"]), mb(gaps["team_articles_estimated_raw_bytes_actionable"])),
                "people with a Wikidata id and a missing birth date, place, country or position: %s" % gaps["people_missing_facts"]]
    return "\n".join(out)


def main(argv):
    prog = db.value("select ingest.harvest_progress()")
    gaps = measure() if "--measure" in argv else None
    if "--json" in argv:
        print(json.dumps({"progress": prog, "gaps": gaps}, indent=1, default=str))
    else:
        print(render(prog, gaps))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except db.DbError as e:
        print("DS1: %s (is the migration db/migrations/095_harvest_queue.sql applied?)" % e, file=sys.stderr)
        sys.exit(2)
