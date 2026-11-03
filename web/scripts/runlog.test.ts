import assert from "node:assert/strict";
import { test } from "node:test";
import { PHRASES } from "../src/lib/i18n/phrases.constants.ts";
import {
  countsLine, dayOf, durationSeconds, EXPECTED, expectedLines, filterQuery, FIXED_SHOW_DAYS, fixedBy, openCount, parseFilters, resolveAlerts, shown, staleAlert, staleCutoff, tone, withStale,
  type AlertRow, type RunFull, type RunLite,
} from "../src/lib/runlog/rules.ts";

/** Run in web/: pnpm test:runlog */

const NOW = Date.parse("2026-10-18T18:00:00Z");
const run = (job: string, started: string, outcome = "ok"): RunLite => ({ uid: `${job}-${started}`, job, outcome, started_at: started, finished_at: started, summary: null });
const alert = (over: Partial<AlertRow>): AlertRow => ({
  id: 1, key: "daily:mlb", job: "daily-scores", scope: "mlb", severity: "error", message: "m", first_at: "2026-10-18T14:00:00Z", last_at: "2026-10-18T14:00:00Z",
  repeats: 1, state: "open", resolved_at: null, dismissed_at: null, dismissed_by: null, ...over,
});
const stateOf = (lines: ReturnType<typeof expectedLines>, job: string) => lines.find((l) => l.job === job)?.state;

test("a daily job that did not run is MISSED once its hour has passed, and not yet before it", () => {
  const early = Date.parse("2026-10-18T12:00:00Z");
  assert.equal(stateOf(expectedLines([], "2026-10-18", early), "daily-scores"), "due-later");
  assert.equal(stateOf(expectedLines([], "2026-10-18", NOW), "daily-scores"), "missed");
  assert.equal(stateOf(expectedLines([], "2026-10-17", NOW), "daily-scores"), "missed", "a past day with no run is missed");
  assert.equal(stateOf(expectedLines([run("daily-scores", "2026-10-18T14:01:00Z")], "2026-10-18", NOW), "daily-scores"), "ran");
});

test("a failed run shows as failed, a day with one failure and a later good run as ran with warnings", () => {
  const fail = run("daily-scores", "2026-10-18T14:01:00Z", "failed");
  assert.equal(stateOf(expectedLines([fail], "2026-10-18", NOW), "daily-scores"), "failed");
  const good = run("daily-scores", "2026-10-18T15:01:00Z");
  assert.equal(stateOf(expectedLines([fail, good], "2026-10-18", NOW), "daily-scores"), "warning");
  assert.equal(stateOf(expectedLines([run("daily-scores", "2026-10-18T14:01:00Z", "running")], "2026-10-18", NOW), "daily-scores"), "running");
});

test("an hourly job is missed when nothing ran in its window, whatever the day's other runs", () => {
  assert.equal(stateOf(expectedLines([run("harvest", "2026-10-18T16:30:00Z")], "2026-10-18", NOW), "harvest"), "ran");
  assert.equal(stateOf(expectedLines([run("harvest", "2026-10-18T09:00:00Z")], "2026-10-18", NOW), "harvest"), "missed", "ran this morning, silent for 9 hours");
  assert.equal(stateOf(expectedLines([run("harvest", "2026-10-17T09:00:00Z")], "2026-10-17", NOW), "harvest"), "ran", "a past day needs one run");
});

test("every expected job has a unique name", () => {
  assert.equal(new Set(EXPECTED.map((e) => e.job)).size, EXPECTED.length);
});

test("filters: unknown kinds, outcomes, jobs and dates are dropped, not passed on", () => {
  assert.deepEqual(parseFilters({ kind: "deploy", outcome: "failed", job: "daily-scores", from: "2026-10-01", to: "2026-10-18", page: "3" }),
    { kind: "deploy", outcome: "failed", job: "daily-scores", from: "2026-10-01", to: "2026-10-18", page: 3 });
  assert.deepEqual(parseFilters({ kind: "x'; drop", outcome: "bad", job: "a b;", from: "2026-13-45", to: "yesterday", page: "-4" }),
    { kind: "", outcome: "", job: "", from: "", to: "", page: 1 });
  assert.deepEqual(parseFilters({ kind: ["job", "deploy"] }).kind, "job");
  assert.equal(filterQuery({ kind: "job", page: 1 }), "?kind=job");
  assert.equal(filterQuery({}), "");
  assert.equal(filterQuery({ job: "harvest", page: 2 }), "?job=harvest&page=2");
});

test("the day of the daily view", () => {
  assert.equal(dayOf("2026-10-01", NOW), "2026-10-01");
  assert.equal(dayOf("nonsense", NOW), "2026-10-18");
  assert.equal(dayOf(undefined, NOW), "2026-10-18");
});

test("the banner shows what nobody dismissed, open first; the menu counts only the open ones", () => {
  const list = [
    alert({ id: 1, key: "a", state: "resolved", last_at: "2026-10-18T16:00:00Z" }),
    alert({ id: 2, key: "b", state: "open", last_at: "2026-10-18T12:00:00Z" }),
    alert({ id: 3, key: "c", state: "open", dismissed_at: "2026-10-18T13:00:00Z" }),
    alert({ id: 4, key: "d", state: "open", last_at: "2026-10-18T15:00:00Z" }),
  ];
  assert.deepEqual(shown(list, NOW).map((a) => a.id), [4, 2, 1], "open first, newest first, the dismissed one gone, the fixed one kept while it is fresh");
  assert.equal(openCount(list), 2);
});

test("stale data: a league with games still unresolved two days on becomes an alert; a stored row wins", () => {
  assert.equal(staleCutoff(NOW), "2026-10-16");
  const a = staleAlert({ league: "nhl", since: "2026-10-15" }, NOW);
  assert.equal(a.key, "stale:nhl");
  assert.match(a.message, /NHL has had no score update for 3 days/);
  const merged = withStale([alert({ key: "stale:nhl", id: 9, dismissed_at: "2026-10-18T10:00:00Z" })], [{ league: "nhl", since: "2026-10-15" }, { league: "mlb", since: "2026-10-14" }], NOW);
  assert.deepEqual(merged.map((m) => m.key), ["stale:nhl", "stale:mlb"], "NHL has a stored (dismissed) row so it is not added again; MLB is added");
  assert.deepEqual(shown(merged).map((m) => m.key), ["stale:mlb"]);
});

test("small helpers", () => {
  assert.equal(tone("ok"), "ok");
  assert.equal(tone("failed"), "bad");
  assert.equal(tone("running"), "idle");
  assert.equal(countsLine({ files_copied: 2, bytes: 5, nested: { x: 1 } }), "files copied 2 · bytes 5");
  assert.equal(durationSeconds("2026-10-18T14:00:00Z", "2026-10-18T14:01:30Z"), 90);
  assert.equal(durationSeconds(null, "2026-10-18T14:01:30Z"), null);
});

test("every phrase the run log pages use exists", () => {
  for (const k of ["runs.title", "runs.daily.title", "runs.state.missed", "runs.alert.dismiss", "runs.detail.title", "menu.runs", "menu.runsAlerts"]) {
    assert.ok(k in PHRASES, k);
  }
  for (const state of ["ran", "failed", "warning", "missed", "due-later", "running"]) assert.ok(`runs.state.${state}` in PHRASES, state);
});

// ---------------------------------------------------------------------------------------------------- alerts that clear themselves

const full = (over: Partial<RunFull> & { job: string; started_at: string }): RunFull => ({
  uid: `${over.job}-${over.started_at}-${over.scope ?? ""}`, kind: "job", outcome: "ok", finished_at: over.started_at, summary: null, scope: null, detail: null, links: null, ...over,
});
const refusedRelease = (number: string, tables: string[], at: string) => full({ job: "release-apply", kind: "release", scope: number, outcome: "failed", started_at: at, detail: JSON.stringify({ tables }) });
const doneRelease = (number: string, tables: string[], at: string) => full({ job: "release-apply", kind: "release", scope: number, outcome: "ok", started_at: at, detail: JSON.stringify({ tables }) });
const relAlert = (number: string, last: string) => alert({ id: 5, key: `release:${number}`, job: "release-apply", scope: number, last_at: last });

test("a refused release is fixed by a later release of the same tables that was applied", () => {
  const a = relAlert("2026.11.03-7", "2026-11-03T10:05:00Z");
  const refused = refusedRelease("2026.11.03-7", ["core.game", "core.person"], "2026-11-03T10:00:00Z");
  assert.equal(fixedBy(a, [refused]), null, "nothing after it");
  assert.equal(fixedBy(a, [refused, doneRelease("2026.11.03-9", ["core.game"], "2026-11-03T12:00:00Z")]), null, "a release of fewer tables does not cover it");
  assert.equal(fixedBy(a, [refused, doneRelease("2026.11.03-6", ["core.game", "core.person"], "2026-11-03T09:00:00Z")]), null, "an earlier one is not a fix");
  const fix = doneRelease("2026.11.03-9", ["core.person", "core.game", "core.team"], "2026-11-03T12:00:00Z");
  assert.equal(fixedBy(a, [refused, fix])?.scope, "2026.11.03-9");
  assert.equal(fixedBy(a, [{ ...refused, detail: null }, fix]), null, "a refused release whose tables the log no longer holds is not judged");
  assert.equal(fixedBy(a, [refused, { ...fix, outcome: "failed" }]), null, "a later release that also failed is no fix");
});

test("drift is fixed by a clean drift run, or by its fix releases being applied", () => {
  const a = alert({ id: 6, key: "drift", job: "drift-check", scope: null, last_at: "2026-11-03T04:00:30Z" });
  const differed = full({ job: "drift-check", outcome: "warning", started_at: "2026-11-03T04:00:00Z", summary: "8 differ. Fix releases 2026.11.03-1, 2026.11.03-2 are waiting under Pending.", links: JSON.stringify({ release: "2026.11.03-1" }) });
  assert.equal(fixedBy(a, [differed]), null);
  assert.equal(fixedBy(a, [differed, doneRelease("2026.11.03-1", ["core.game"], "2026-11-03T08:00:00Z")]), null, "one of two fix releases is not enough");
  const both = fixedBy(a, [differed, doneRelease("2026.11.03-1", ["core.game"], "2026-11-03T08:00:00Z"), doneRelease("2026.11.03-2", ["core.person"], "2026-11-03T09:00:00Z")]);
  assert.equal(both?.scope, "2026.11.03-2", "both applied: fixed at the later one");
  assert.equal(fixedBy(a, [differed, doneRelease("2026.11.03-1", [], "2026-11-03T03:00:00Z"), doneRelease("2026.11.03-2", [], "2026-11-03T03:30:00Z")]), null, "releases applied before the drift run do not count");
  assert.equal(fixedBy(a, [differed, full({ job: "drift-check", outcome: "ok", started_at: "2026-11-04T04:00:00Z" })])?.started_at, "2026-11-04T04:00:00Z");
  assert.equal(fixedBy(a, [differed, full({ job: "drift-check", outcome: "warning", started_at: "2026-11-04T04:00:00Z" })]), null, "a later run that still differs is no fix");
});

test("raw-export is fixed by a later clean run of the same job", () => {
  const a = alert({ id: 7, key: "raw-export", job: "raw-export", scope: null, last_at: "2026-11-02T22:50:00Z" });
  assert.equal(fixedBy(a, [full({ job: "raw-export", outcome: "warning", started_at: "2026-11-02T23:50:00Z" })]), null);
  assert.equal(fixedBy(a, [full({ job: "raw-export", outcome: "ok", started_at: "2026-11-02T21:50:00Z" })]), null, "a clean run before the alert is no fix");
  assert.equal(fixedBy(a, [full({ job: "harvest", outcome: "ok", started_at: "2026-11-03T00:50:00Z" })]), null, "another job's run is no fix");
  assert.ok(fixedBy(a, [full({ job: "raw-export", outcome: "ok", started_at: "2026-11-03T00:50:00Z" })]));
});

test("daily-scores alerts are fixed by a later run that saved the same league", () => {
  const day = (lg: Record<string, string>, at: string, outcome = "ok") => full({ job: "daily-scores", outcome, started_at: at, detail: JSON.stringify({ league_results: Object.fromEntries(Object.entries(lg).map(([k, v]) => [k, { outcome: v }])) }) });
  const mlb = alert({ id: 8, key: "daily:mlb", scope: "mlb", last_at: "2026-11-02T16:30:00Z" });
  assert.equal(fixedBy(mlb, [day({ nhl: "ok" }, "2026-11-03T16:00:00Z")]), null, "a run that did not touch mlb is no fix");
  assert.equal(fixedBy(mlb, [day({ mlb: "failed" }, "2026-11-03T16:00:00Z", "failed")]), null);
  assert.ok(fixedBy(mlb, [day({ mlb: "ok", nhl: "failed" }, "2026-11-03T16:00:00Z", "failed")]), "mlb saved, another league failed: mlb is fixed");
  assert.ok(fixedBy(mlb, [day({ mlb: "warning" }, "2026-11-03T16:00:00Z", "warning")]), "saved with something left out still saves it");
  const left = alert({ id: 9, key: "daily-left-out:mlb", scope: "mlb", severity: "warning", last_at: "2026-11-02T16:30:00Z" });
  assert.equal(fixedBy(left, [day({ mlb: "warning" }, "2026-11-03T16:00:00Z", "warning")]), null, "still left out");
  assert.ok(fixedBy(left, [day({ mlb: "ok" }, "2026-11-03T16:00:00Z")]));
  const stopped = alert({ id: 10, key: "daily:run", scope: null, last_at: "2026-11-02T16:30:00Z" });
  assert.equal(fixedBy(stopped, [day({}, "2026-11-03T16:00:00Z", "failed")]), null);
  assert.ok(fixedBy(stopped, [day({ mlb: "ok" }, "2026-11-03T16:00:00Z")]));
});

test("resolveAlerts marks only the fixed open alerts, and a fixed one drops off after the days it is kept", () => {
  const alerts = [
    alert({ id: 1, key: "raw-export", job: "raw-export", scope: null, last_at: "2026-11-02T22:50:00Z" }),
    alert({ id: 2, key: "harvest:cycle", job: "harvest", scope: null, last_at: "2026-11-02T22:50:00Z" }),
    alert({ id: 3, key: "x", job: "raw-export", scope: null, last_at: "2026-11-02T22:50:00Z", dismissed_at: "2026-11-02T23:00:00Z" }),
    alert({ id: -1, key: "stale:nhl", job: "stale-data", scope: "nhl", last_at: "2026-11-02T22:50:00Z" }),
  ];
  const out = resolveAlerts(alerts, [full({ job: "raw-export", outcome: "ok", started_at: "2026-11-03T01:00:00Z", finished_at: "2026-11-03T01:05:00Z" })]);
  assert.deepEqual(out.map((a) => a.state), ["resolved", "open", "open", "open"]);
  assert.equal(out[0].resolved_at, "2026-11-03T01:05:00Z", "fixed when the run that fixed it ended");
  const day = 86_400_000;
  const at = Date.parse("2026-11-03T01:05:00Z");
  assert.ok(shown(out, at + 1000).some((a) => a.key === "raw-export"), "fixed alerts stay shown at first");
  assert.ok(shown(out, at + (FIXED_SHOW_DAYS - 0.5) * day).some((a) => a.key === "raw-export"));
  assert.ok(!shown(out, at + (FIXED_SHOW_DAYS + 0.5) * day).some((a) => a.key === "raw-export"), "and drop off after the days are up");
  assert.ok(shown(out, at + 30 * day).some((a) => a.key === "harvest:cycle"), "an open alert never drops off");
  assert.equal(openCount(out), 3 - 1, "a fixed alert is no longer counted as open (the dismissed one never was)");
});
