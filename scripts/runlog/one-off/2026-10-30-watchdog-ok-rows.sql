-- One-off cleanup of the run log (Turso, SQLite dialect). NOT run by any script: the coordinating session runs it after John's OK.
-- Until the watchdog fix is deployed it wrote a "probes are answering" entry on every good probe (about 720 a day).
-- This keeps the first such entry of every UTC hour (a proof that the watchdog ran) and deletes the rest that are more than a day old.
-- Only these rows are touched: job 'watchdog', outcome 'ok', the beat's own summary. Incidents, reloads, restarts and "answers again" entries stay.
-- Safe to run more than once, and before or after the fixed runner is live (rows from the last day are never deleted).
--
-- 1. Count first (read only):
--      select count(*) as beat_rows, count(distinct substr(started_at, 1, 13)) as hours_kept,
--             sum(started_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day')) as older_than_a_day
--      from run_log where job = 'watchdog' and outcome = 'ok' and summary = 'probes are answering';
--    Expected on 2026-10-30 (1,584 rows, one every 2 minutes since about 2026-10-28T07:00Z): about 860 rows are older than a day, in about 30
--    distinct hours, so the delete removes about 830 and leaves about 750 (the rows of the last day stay until a later run; a second run
--    after the fix is live removes most of those too, leaving 1 per hour). A simulation of this exact statement on 1,584 two-minute rows gave
--    864 old rows in 30 hours, 834 deleted, 750 left. The exact figure is the count above minus its hours_kept.
--
-- 2. Delete:
delete from run_log
where job = 'watchdog' and outcome = 'ok' and summary = 'probes are answering'
  and started_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day')
  and id not in (
    select min(id) from run_log
    where job = 'watchdog' and outcome = 'ok' and summary = 'probes are answering'
    group by substr(started_at, 1, 13)
  );
--
-- 3. Check: this returns no row with more than one entry in an hour that is older than a day.
--      select substr(started_at, 1, 13) as hour, count(*) from run_log
--      where job = 'watchdog' and outcome = 'ok' and summary = 'probes are answering' and started_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day')
--      group by hour having count(*) > 1;
