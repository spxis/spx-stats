"""The work queue (ingest.harvest_job) and its state machine.

States:  queued -> running -> done | gone | failed | queued (a transient error, backed off)
         done / gone / failed come due again at next_check_at (a re-read), and then run like a queued job.
The transitions are pure functions of (job, now, outcome) so they are tested without a database: after_success, after_missing, after_error.
Everything that touches DS1 builds one SQL statement from them. One worker claims jobs with `for update skip locked` and a lease; a worker that
dies leaves `running` rows whose lease passes, and the next claim takes them again, so a restart loses nothing and repeats at most one batch.
"""
from datetime import timedelta

import db
from netapi import backoff_delay  # noqa: F401  (re-exported for the tests)
from tiers import refresh_priority

WP_KINDS = ("wp_team_season", "wp_league_season", "wp_draft")
FAMILIES = {k: WP_KINDS for k in WP_KINDS}      # kinds that share one API request; every other kind is its own family
GONE_RECHECK_DAYS = 90
FAILED_RECHECK_DAYS = 7
EXHAUSTED_RECHECK_DAYS = 1


def family(kind):
    return FAMILIES.get(kind, (kind,))


def after_success(job, cfg, now, revision=None, sha256=None, changed=True):
    """The job was read (changed) or checked and found the same (not changed). It comes due again after its refresh interval, and from now on
    it is a re-read, so it drops below every gap job."""
    days = job.get("refresh_days") or cfg.old_refresh_days
    out = dict(state="done", attempts=0, gap=False, priority=refresh_priority(job.get("season")), error=None,
               next_check_at=now + timedelta(days=days), lease_until=None)
    out["last_revision"] = revision if revision is not None else job.get("last_revision")
    out["last_sha256"] = sha256 if sha256 is not None else job.get("last_sha256")
    out["last_fetched_at"] = now if changed else job.get("last_fetched_at")
    return out


def after_missing(job, cfg, now):
    """The page or item does not exist (yet). Looked at again in 90 days; it counts as read, not as a gap left to fill."""
    return dict(state="gone", attempts=0, gap=False, priority=refresh_priority(job.get("season")), error="missing",
                next_check_at=now + timedelta(days=GONE_RECHECK_DAYS), lease_until=None,
                last_revision=job.get("last_revision"), last_sha256=job.get("last_sha256"), last_fetched_at=job.get("last_fetched_at"))


def after_error(job, cfg, now, err, permanent=False):
    """A failed try. Permanent (the request is refused): failed, retried in a week. Transient: back to queued with a growing wait
    (5, 10, 20, 40, 80 minutes), and after `max_attempts` failed, retried in a day. The gap flag and the priority stay, so it is still a gap left."""
    attempts = int(job.get("attempts") or 0) + 1
    msg = str(err)[:500]
    keep = dict(gap=job.get("gap", False), priority=job.get("priority", 0), lease_until=None, error=msg, attempts=attempts,
                last_revision=job.get("last_revision"), last_sha256=job.get("last_sha256"), last_fetched_at=job.get("last_fetched_at"))
    if permanent:
        return dict(keep, state="failed", next_check_at=now + timedelta(days=FAILED_RECHECK_DAYS))
    if attempts >= cfg.max_attempts:
        return dict(keep, state="failed", next_check_at=now + timedelta(days=EXHAUSTED_RECHECK_DAYS))
    return dict(keep, state="queued", next_check_at=now + timedelta(seconds=backoff_delay(attempts - 1, base=300.0, cap=6 * 3600.0)))


def after_lag(job, cfg, now):
    """The wiki said maxlag on every try: back in the queue in 10 minutes, same place in the line, no attempt counted."""
    return dict(state="queued", attempts=int(job.get("attempts") or 0), gap=job.get("gap", False), priority=job.get("priority", 0), lease_until=None,
                error="wiki busy (maxlag)", next_check_at=now + timedelta(minutes=10), last_revision=job.get("last_revision"),
                last_sha256=job.get("last_sha256"), last_fetched_at=job.get("last_fetched_at"))


# ---------------------------------------------------------------- DS1

def _ts(t):
    """A timestamp for SQL: a datetime, or the ISO string DS1 gave back for a column we leave as it was."""
    return "null" if t is None else "'%s'::timestamptz" % (t if isinstance(t, str) else t.isoformat())


def update_sql(job_id, new):
    return ("update ingest.harvest_job set state=%s, attempts=%d, gap=%s, priority=%d, error=%s, next_check_at=%s, lease_until=null, "
            "last_revision=%s, last_sha256=%s, last_fetched_at=%s, updated_at=now() where job_id=%d;\n"
            % (db.lit(new["state"]), new["attempts"], db.lit(new["gap"]), new["priority"], db.lit(new["error"]), _ts(new["next_check_at"]),
               db.lit(new["last_revision"]), db.lit(new["last_sha256"]), _ts(new["last_fetched_at"]), job_id))


def enqueue_sql(targets, chunk=1000):
    """Upsert targets (dicts: kind, target, league, season, priority, gap, refresh_days). A job that is already queued only gets a higher priority
    or the gap flag; one that was read (done, gone, failed) or is running is left alone, so a planner run never undoes a result."""
    out = []
    for i in range(0, len(targets), chunk):
        vals = ",\n".join("(%s,%s,%s,%s,%d,%s,%d)" % (db.lit(t["kind"]), db.lit(t["target"]), db.lit(t.get("league")), db.lit(t.get("season")),
                                                       t["priority"], db.lit(bool(t.get("gap"))), t.get("refresh_days", 120)) for t in targets[i:i + chunk])
        out.append("insert into ingest.harvest_job as j (kind, target, league, season, priority, gap, refresh_days) values\n%s\n"
                   "on conflict (kind, target) do update set priority = greatest(j.priority, excluded.priority), gap = j.gap or excluded.gap, "
                   "league = coalesce(j.league, excluded.league), season = coalesce(j.season, excluded.season), updated_at = now() "
                   "where j.state = 'queued';\n" % vals)
    return "".join(out)


DUE = "next_check_at <= now() and (state <> 'running' or lease_until < now())"


def claim(cfg, limit_for):
    """Take the next due job and, with it, up to batch-size - 1 more of its family. -> list of job dicts (state is now running, leased).
    `limit_for(head)` gives the batch size for the head job (a dict with kind and last_revision)."""
    head = db.rows("select kind, last_revision from ingest.harvest_job where %s order by priority desc, next_check_at, job_id limit 1" % DUE)
    if not head:
        return []
    kinds = family(head[0]["kind"])
    n = limit_for(head[0])
    return db.query_json(
        "with picked as (select job_id from ingest.harvest_job where kind in (%s) and %s order by priority desc, next_check_at, job_id limit %d "
        "for update skip locked), u as (update ingest.harvest_job j set state='running', lease_until = now() + interval '%d seconds', updated_at = now() "
        "from picked p where j.job_id = p.job_id returning j.*) select coalesce(jsonb_agg(to_jsonb(u) order by u.priority desc, u.job_id), '[]'::jsonb) from u"
        % (",".join(db.lit(k) for k in kinds), DUE, n, cfg.lease_secs)) or []


def counts():
    return db.rows("select kind, state, count(*) n, count(*) filter (where gap) gap from ingest.harvest_job group by 1, 2 order by 1, 2")
