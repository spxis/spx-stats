import assert from "node:assert/strict";
import { test } from "node:test";
import { PHRASES } from "../src/lib/i18n/phrases.constants.ts";
import {
  countsLine, dayOf, durationSeconds, EXPECTED, expectedLines, filterQuery, openCount, parseFilters, shown, staleAlert, staleCutoff, tone, withStale,
  type AlertRow, type RunLite,
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
  assert.deepEqual(shown(list).map((a) => a.id), [4, 2, 1], "open first, newest first, the dismissed one gone, the fixed one kept until dismissed");
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
