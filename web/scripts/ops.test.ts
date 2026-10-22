import assert from "node:assert/strict";
import { test } from "node:test";
import { PHRASES } from "../src/lib/i18n/phrases.constants.ts";
import { FR } from "../src/lib/i18n/dictionaries/fr.constants.ts";
import { JA } from "../src/lib/i18n/dictionaries/ja.constants.ts";
import { placeholders as placeholdersIn } from "./i18n-sheet.ts";
import { age, asOf, clock, exportVerdict, harvesterTone, issues, lastScoreRequest, leagueTone, minutesBetween, openScoreRequest, pauseControl, queuedOf, requestBlock, scoreBlock, series, sparkline, syncRows } from "../src/lib/ops/rules.ts";
import { dashboard, isFailed, SCORE_LEAGUES, snapshot, type Dashboard } from "../src/lib/ops/schema.ts";

/** Run in web/: pnpm test:ops */

const AT = "2026-10-15T14:00:00Z";
const ago = (min: number) => new Date(Date.parse(AT) - min * 60_000).toISOString();

/** A snapshot as scripts/release/ops.py writes it (see scripts/release/test/test_ops.py), healthy unless a test changes something. */
const payload = () => ({
  v: 1,
  at: AT,
  harvester: {
    state: "running", paused: null, last_beat_at: ago(0), run: { id: 7, outcome: "running", started_at: ago(30), sha: "deadbee", paused_secs: 0 },
    queue: { wp_team_season: { queued: 120, done: 30 }, wd_person: { queued: 800, failed: 2 } }, queued_total: 920,
    gap: [["wd_person", "-", 802], ["wp_team_season", "nba", 90]], gap_total: 892,
    today: { requests: 400, bytes: 5_000_000, archived: 90 }, hour: { requests: 180, bytes: 2_000_000, archived: 40 }, last_error: null, archive_rows: 1234,
  },
  daily: { last: { id: 3, outcome: "ok", started_at: ago(240), finished_at: ago(235), counts: { games: 12 } }, ok_7d: 6, failed_7d: 0, release: { number: "2026.10.15-2", status: "done", at: ago(230) } },
  scores: {
    limits: { stale: 6, overdue: 12, no_run: 20 }, last_run: { id: 3, outcome: "ok", started_at: ago(245) }, running: false, quiet_hours: 4, no_run: false,
    leagues: ["nhl", "nba", "mlb", "nfl", "cfl"].map((league) => ({
      league, outcome: "ok", reason: null, at: ago(235), ok_at: ago(235), changed_at: ago(235), games_skipped: 0, clubs_skipped: [], waiting: 0, overdue: 0, oldest: null, sample: [], stale_hours: 3, flags: [],
    })) as Array<Record<string, unknown>>,
  },
  watchdog: { enabled: true, known: true, last_probe_at: ago(0.5), last_ok_at: ago(0.5), last_probe_ok: true, streak: 0, last_error: null, open: null, last_incident: null },
  releases: { pending: 0, approved: 0, running: 0, last_done: { number: "2026.10.15-2", title: "Daily scores", kind: "daily_scores", at: ago(220) }, last_failed: null, drift_checked_at: ago(600), nightly_drift_day: "2026-10-15", runner: { sha: "abc1234", ref: "origin/main" } },
  sync: { tables: [["core.game", 1000, 1000, 0], ["core.person", 50, 49, 1], ["meta.source", 9, 9, 0]], differs: 1, count: 3, checked_at: ago(600), oldest_checked_at: ago(601) },
  backup: { archive_rows: 500, archive_bytes: 9_000_000, export: { at: ago(40), outcome: "ok", checked: 500, copied: 3, present: 497, failed: 0, bytes: 1234, seconds: 20 }, last_ok_at: ago(40) },
});

const history = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, t: ago((n - i) * 15), pages: i * 2, requests: i, gaps: 900 - i * 3, queued: 920, differs: 1 }));

function dash(mutate: (p: ReturnType<typeof payload>) => void = () => {}, takenMinutesAgo = 5): Dashboard {
  const p = payload();
  mutate(p);
  return dashboard.parse({ latest: { id: 9, taken_at: ago(takenMinutesAgo - 0), payload: p }, history: history(8), requests: [], server_now: AT });
}
const keys = (d: Dashboard) => issues(d).map((i) => i.key);

test("the runner's snapshot and the dashboard answer parse, and a section that failed stays a section", () => {
  assert.equal(snapshot.safeParse(payload()).success, true);
  const d = dash((p) => { (p as Record<string, unknown>).harvester = { error: "relation ingest.harvest_job does not exist" }; });
  assert.ok(d.latest && isFailed(d.latest.payload.harvester));
  assert.ok(d.latest && !isFailed(d.latest.payload.sync));
  assert.equal(dashboard.parse({ latest: null, history: [], requests: [], server_now: AT }).latest, null);
  assert.equal(dashboard.safeParse({ latest: { id: 1, taken_at: AT, payload: { v: 1 } }, server_now: AT }).success, false, "a snapshot without its sections is refused, not half drawn");
});

test("the snapshot's age is measured by the database's clock, and an old one is stale", () => {
  assert.deepEqual(asOf(ago(7), AT), { clock: "13:53", minutes: 7, stale: false });
  assert.equal(asOf(ago(91), AT).stale, true);
  assert.equal(asOf(ago(60), AT).stale, false, "an unchanged system writes one an hour");
  assert.equal(asOf("nonsense", AT).stale, true);
  assert.equal(minutesBetween(ago(5), "2026-10-15T13:00:00Z"), 0, "never negative");
  assert.equal(clock("2026-10-15T09:05:59Z"), "09:05");
  assert.equal(clock(null), null);
});

test("an age is shown in its largest whole unit", () => {
  assert.deepEqual(age(0), { unit: "minute", n: 0 });
  assert.deepEqual(age(59), { unit: "minute", n: 59 });
  assert.deepEqual(age(60), { unit: "hour", n: 1 });
  assert.deepEqual(age(47 * 60), { unit: "hour", n: 47 });
  assert.deepEqual(age(3 * 24 * 60 + 5), { unit: "day", n: 3 });
});

test("a healthy system has nothing that needs a look", () => {
  assert.deepEqual(keys(dash((p) => { p.sync.differs = 0; p.sync.tables = p.sync.tables.map((t) => [t[0], t[1], t[1], 0]); })), []);
});

test("what needs a look, worst first", () => {
  const found = issues(dash((p) => {
    p.watchdog.open = { since: ago(50), recovered_at: null, reload_at: ago(45), restart_at: null, probes_failed: 7, error: "HTTP 503" } as never;
    p.backup.export.failed = 2;
    p.releases.pending = 1;
  }));
  assert.deepEqual(found.map((i) => i.key), ["backupProblems", "watchdogOpen", "syncDiffers", "releasesWaiting"], "worst level first, in the order the sections are checked inside a level");
  assert.deepEqual(found.map((i) => i.level), ["bad", "bad", "warn", "info"]);
  assert.equal(found[1]?.vars.probes, 7);
});

test("the harvester's states", () => {
  assert.deepEqual(keys(dash((p) => { p.harvester.state = "paused"; p.harvester.paused = { by: "john@example.test", at: ago(3) } as never; })).filter((k) => k.startsWith("harvester")), ["harvesterPaused"]);
  const stale = issues(dash((p) => { p.harvester.state = "stale"; p.harvester.last_beat_at = ago(20); })).find((i) => i.key === "harvesterStale");
  assert.equal(stale?.level, "bad");
  assert.equal(stale?.vars.minutes, 20);
  assert.ok(keys(dash((p) => { p.harvester.state = "stopped"; p.harvester.last_beat_at = ago(300); })).includes("harvesterStopped"));
  assert.ok(keys(dash((p) => { p.harvester.state = "never"; })).includes("harvesterNever"));
  assert.equal(harvesterTone("running"), "done");
  assert.equal(harvesterTone("paused"), "live");
  assert.equal(harvesterTone("stale"), "stale");
});

test("the Dropbox backup: never, problems, overdue, behind, no table", () => {
  assert.ok(keys(dash((p) => { p.backup.export = null as never; p.backup.last_ok_at = null as never; })).includes("backupNever"));
  assert.ok(keys(dash((p) => { p.backup.export = { error: "no table" } as never; })).includes("backupMissingTable"));
  assert.ok(keys(dash((p) => { p.backup.last_ok_at = ago(5 * 60); })).includes("backupStale"), "no good run for 5 hours");
  assert.ok(!keys(dash((p) => { p.backup.last_ok_at = ago(100); })).includes("backupStale"));
  const behind = issues(dash((p) => { p.backup.archive_rows = 510; })).find((i) => i.key === "backupBehind");
  assert.equal(behind?.vars.rows, 10, "500 files were handled by the last export, 510 are in the archive");
  assert.ok(!keys(dash((p) => { p.backup.archive_rows = 510; p.backup.export.failed = 1; })).includes("backupBehind"), "problems already say it");
  const b = payload().backup;
  assert.equal(exportVerdict(dash().latest!.payload.backup as never, AT), "ok");
  assert.equal(exportVerdict({ ...b, export: null } as never, AT), "never");
  assert.equal(exportVerdict({ ...b, export: { ...b.export, failed: 1 } } as never, AT), "problems");
  assert.equal(exportVerdict({ ...b, last_ok_at: ago(400) } as never, AT), "stale");
  assert.equal(exportVerdict({ ...b, export: { error: "x" } } as never, AT), "unknown");
});

test("DS1 against production: differences, a stale comparison, none yet", () => {
  assert.ok(keys(dash()).includes("syncDiffers"));
  assert.ok(keys(dash((p) => { p.sync.checked_at = ago(40 * 60); })).includes("syncStale"));
  assert.ok(keys(dash((p) => { p.sync.checked_at = null as never; p.sync.differs = 0; })).includes("syncNever"));
});

test("the comparison table puts differing tables first, the biggest gap first", () => {
  const sync = { tables: [["core.a", 10, 10, 0], ["core.z", 100, 90, 1], ["core.b", 5, 6, 1], ["meta.c", 1, 1, 0]], differs: 3, count: 4, checked_at: AT, oldest_checked_at: AT } as never;
  const rows = syncRows(sync);
  assert.deepEqual(rows.map((r) => r.table), ["core.z", "core.b", "core.a", "meta.c"]);
  assert.deepEqual(rows.map((r) => r.delta), [-10, 1, 0, 0]);
  assert.deepEqual(syncRows({ tables: [["core.x", null, 3, 1]], differs: 1, count: 1, checked_at: AT, oldest_checked_at: AT } as never)[0], { table: "core.x", ds1: null, prod: 3, differs: true, delta: null });
});

test("the daily job and the watchdog", () => {
  assert.ok(keys(dash((p) => { p.daily.last.outcome = "failed"; })).includes("dailyFailed"));
  assert.ok(keys(dash((p) => { p.daily.last.started_at = ago(31 * 60); })).includes("dailyStale"));
  assert.ok(keys(dash((p) => { p.daily.last = null as never; })).includes("dailyNever"));
  assert.ok(keys(dash((p) => { p.watchdog.last_probe_at = ago(9); })).includes("watchdogSilent"));
  assert.ok(!keys(dash((p) => { p.watchdog.last_probe_at = ago(2); })).includes("watchdogSilent"));
  assert.ok(keys(dash((p) => { p.watchdog.enabled = false; })).includes("watchdogOff"));
  assert.ok(!keys(dash((p) => { p.watchdog.enabled = false; p.watchdog.last_probe_at = ago(60); })).includes("watchdogSilent"), "a watchdog that is off is not silent");
});

test("a snapshot the runner stopped sending is the first thing to say, and a failed section is named", () => {
  const stale = issues(dash(() => {}, 120));
  assert.equal(stale[0]?.key, "snapshotStale");
  assert.equal(stale[0]?.vars.minutes, 120);
  const failed = issues(dash((p) => { (p as Record<string, unknown>).daily = { error: "x" }; (p as Record<string, unknown>).releases = { error: "y" }; })).find((i) => i.key === "sectionFailed");
  assert.equal(failed?.vars.sections, "daily, releases");
  assert.deepEqual(issues(dashboard.parse({ latest: null, history: [], requests: [], server_now: AT })), [], "no snapshot at all is a message of its own");
});

test("sparklines scale into the box, start at zero, and need two points", () => {
  assert.equal(sparkline([5]), null);
  assert.equal(sparkline([null, null, 4]), null);
  const s = sparkline([0, 5, 10], 100, 20, 0)!;
  assert.equal(s.points, "0.0,20.0 50.0,10.0 100.0,0.0");
  assert.equal(s.max, 10);
  assert.equal(s.last, 10);
  const flat = sparkline([3, 3, 3], 100, 20, 0)!;
  assert.equal(flat.min, 0, "a flat low line is drawn at its height above zero, not as a mountain");
  assert.equal(flat.points, "0.0,0.0 50.0,0.0 100.0,0.0");
  const gap = sparkline([1, null, 3], 100, 20, 0)!;
  assert.equal(gap.points.split(" ").length, 2, "a missing snapshot value leaves a gap");
  assert.deepEqual(series(history(3), "pages"), [0, 2, 4]);
  assert.deepEqual(series(history(3), "gaps"), [900, 897, 894]);
});

test("the harvester button: Pause while it runs, Resume while it is paused, off while a request waits", () => {
  const running = dash().latest!.payload.harvester as never;
  const paused = dash((p) => { p.harvester.state = "paused"; }).latest!.payload.harvester as never;
  assert.deepEqual(pauseControl(running, []), { show: "pause", waiting: null });
  assert.deepEqual(pauseControl(paused, []), { show: "resume", waiting: null });
  const queued = [{ id: 4, kind: "harvest_pause", requested_by: "x", requested_at: AT, status: "queued", finished_at: null, summary: null }] as never;
  assert.equal(pauseControl(running, queued).waiting, "harvest_pause");
  assert.equal(queuedOf(queued, "harvest_pause")?.id, 4);
  assert.equal(queuedOf(queued, "harvest_resume"), null);
  assert.deepEqual(pauseControl(null, []), { show: "pause", waiting: null });
});

test("why a request would be refused, matching migration 104", () => {
  const now = Date.parse(AT);
  const r = (kind: string, status: string, finished: number | null) => ({ id: 1, kind, requested_by: "x", requested_at: ago(10), status, finished_at: finished === null ? null : ago(finished), summary: null }) as never;
  assert.equal(requestBlock([r("snapshot", "queued", null)], "snapshot", now), "waiting");
  assert.equal(requestBlock([r("snapshot", "queued", null)], "harvest_pause", now), null, "kinds are separate");
  assert.equal(requestBlock([r("snapshot", "done", 1)], "snapshot", now), "recent", "a snapshot needs two minutes");
  assert.equal(requestBlock([r("snapshot", "done", 3)], "snapshot", now), null);
  assert.equal(requestBlock([r("harvest_pause", "done", 0.5)], "harvest_pause", now), "recent", "pause and resume need one minute");
  assert.equal(requestBlock([r("harvest_pause", "done", 2)], "harvest_pause", now), null);
  assert.equal(requestBlock([], "snapshot", now), null);
});

// ---------------------------------------------------------------------------------------------------- the words

const english = PHRASES as Readonly<Record<string, string>>;
const dictionaries: Record<string, Readonly<Record<string, string | undefined>>> = { French: FR, Japanese: JA };
const opsKeys = Object.keys(english).filter((k) => k.startsWith("ops.") || /^confirm\.ops/.test(k));
/** Added in English only (AGENTS.md section 9: French and Japanese come from scripts/i18n/batch.py); the page shows the English until they land. */
const awaitingBatch = (k: string) => /^(ops\.scores\.|ops\.msg\.league\.|ops\.issue\.scores|confirm\.opsLeague\.)/.test(k);

test("every ops phrase is in English, French and Japanese with the same {placeholders}", () => {
  assert.ok(opsKeys.length > 120, `only ${opsKeys.length} ops phrases found`);
  for (const k of opsKeys) {
    for (const [name, dictionary] of Object.entries(dictionaries)) {
      if (awaitingBatch(k) && !dictionary[k]) continue;
      assert.ok(dictionary[k], `${name} lacks ${k}`);
      assert.deepEqual(placeholdersIn(dictionary[k] as string).sort(), placeholdersIn(english[k] as string).sort(), `${name} ${k}`);
    }
  }
});

test("every issue the rules can raise has a phrase, and the variables it passes are the ones the phrase fills", () => {
  const raised = new Map<string, Set<string>>();
  const everything = [
    dash((p) => {
      p.watchdog.open = { since: ago(50), recovered_at: null, reload_at: null, restart_at: null, probes_failed: 7, error: null } as never;
      p.backup.export.failed = 2; p.backup.last_ok_at = ago(400); p.backup.archive_rows = 600; p.releases.pending = 2; p.harvester.state = "paused"; p.watchdog.last_probe_at = ago(9);
      p.daily.last.outcome = "failed"; p.daily.last.started_at = ago(40 * 60); p.sync.checked_at = ago(40 * 60);
      (p as Record<string, unknown>).releases = { error: "x" };
    }, 120),
    dash((p) => { p.harvester.state = "stale"; p.backup.export = null as never; p.sync.checked_at = null as never; p.daily.last = null as never; p.watchdog.enabled = false; }),
    dash((p) => { p.harvester.state = "stopped"; p.backup.export = { error: "x" } as never; }),
    dash((p) => { p.harvester.state = "never"; }),
    dash((p) => {
      const l = p.scores.leagues;
      l[1] = { ...l[1], outcome: "failed", reason: "a check failed", ok_at: ago(2000), stale_hours: 33, flags: ["stale"] };
      l[2] = { ...l[2], outcome: "failed", reason: "a check failed", ok_at: null, stale_hours: null, flags: ["stale"] };
      l[0] = { ...l[0], waiting: 7, overdue: 3, oldest: ago(1500), flags: ["overdue"] };
      p.scores.no_run = true; p.scores.quiet_hours = 25;
    }),
  ];
  for (const d of everything) for (const i of issues(d)) raised.set(i.key, new Set(Object.keys(i.vars)));
  assert.ok(raised.size >= 22, `only ${raised.size} issue kinds raised in this test`);
  for (const [key, vars] of raised) {
    const text = english[`ops.issue.${key}`];
    assert.ok(text, `no phrase ops.issue.${key}`);
    assert.deepEqual(placeholdersIn(text).sort(), [...vars].sort(), key);
  }
});

test("the confirmation dialogs of the three controls exist", () => {
  for (const k of ["opsSnapshot", "opsPause", "opsResume"]) for (const part of ["title", "body", "action"]) assert.ok(english[`confirm.${k}.${part}`], `${k} ${part}`);
});


// ---------------------------------------------------------------------------------------------------- scores by league

const stamp = (league: string, over: Record<string, unknown> = {}) => ({
  league, outcome: "ok", reason: null, at: ago(60), ok_at: ago(60), changed_at: ago(60), games_skipped: 0, clubs_skipped: [], waiting: 0, overdue: 0, oldest: null, sample: [], stale_hours: 1, flags: [], ...over,
});

test("the scores section parses, is optional for older snapshots, and a section that failed stays a section", () => {
  assert.equal(snapshot.safeParse(payload()).success, true);
  const d = dash();
  assert.ok(d.latest && d.latest.payload.scores && !isFailed(d.latest.payload.scores));
  assert.equal(d.latest.payload.scores.leagues.length, 5);
  const old = payload() as Record<string, unknown>;
  delete old.scores;
  assert.equal(snapshot.safeParse(old).success, true, "a snapshot from before the scores section is still a snapshot");
  const broken = dash((p) => { (p as Record<string, unknown>).scores = { error: "relation ingest.daily_run does not exist" }; });
  assert.ok(broken.latest && broken.latest.payload.scores && isFailed(broken.latest.payload.scores));
  assert.ok(keys(broken).includes("sectionFailed") && !keys(broken).some((k) => k.startsWith("scores")));
  assert.equal(dashboard.parse({ latest: null, history: [], requests: [], server_now: AT }).score_requests.length, 0, "no scores requests before migration 150");
});

test("the table's league list is the job's", () => {
  assert.deepEqual([...SCORE_LEAGUES], ["nhl", "nba", "mlb", "nfl", "cfl"]);
});

test("a healthy day raises no scores issue; a stale league, an overdue league and a silent job each do, with the numbers the phrase fills", () => {
  assert.deepEqual(keys(dash()).filter((k) => k.startsWith("scores")), []);
  const bad = dash((p) => {
    const l = p.scores.leagues;
    l[1] = stamp("nba", { outcome: "failed", reason: "a check failed", ok_at: ago(2000), stale_hours: 33, flags: ["stale"] });
    l[2] = stamp("mlb", { outcome: "failed", reason: "x", ok_at: null, stale_hours: null, flags: ["stale"] });
    l[0] = stamp("nhl", { waiting: 7, overdue: 3, flags: ["overdue"] });
    p.scores.no_run = true; p.scores.quiet_hours = 25;
  });
  const found = issues(bad).filter((i) => i.key.startsWith("scores"));
  const byKey = (k: string) => found.filter((i) => i.key === k);
  assert.deepEqual(byKey("scoresStale").map((i) => i.vars), [{ league: "NBA", hours: 33 }]);
  assert.deepEqual(byKey("scoresStaleNever").map((i) => i.vars), [{ league: "MLB" }]);
  assert.deepEqual(byKey("scoresOverdue").map((i) => i.vars), [{ league: "NHL", count: 3, hours: 12 }]);
  assert.deepEqual(byKey("scoresNoRun").map((i) => i.vars), [{ hours: 25 }]);
  assert.equal(byKey("scoresOverdue")[0].level, "warn");
  assert.ok(["scoresStale", "scoresStaleNever", "scoresNoRun"].every((k) => byKey(k)[0].level === "bad"));
  // worst first: the bad ones come before the warning
  const order = issues(bad).map((i) => i.level);
  assert.deepEqual(order, [...order].sort((a, b) => ({ bad: 0, warn: 1, info: 2 }[a] - { bad: 0, warn: 1, info: 2 }[b])));
});

test("every scores issue and every phrase the scores section and its button use exist in English", () => {
  for (const k of ["scoresStale", "scoresStaleNever", "scoresOverdue", "scoresNoRun"]) assert.ok(english[`ops.issue.${k}`], k);
  const keysUsed = [
    "title", "intro", "limits", "noSection", "noRun", "running", "open", "allLeagues", "col.league", "col.status", "col.lastGood", "col.waiting", "col.lastRun", "col.update",
    "outcome.ok", "outcome.warning", "outcome.failed", "outcome.skipped", "outcome.unknown", "flag.stale", "flag.staleNever", "flag.overdue", "noGood", "goodAt", "changedAt",
    "oldest", "game", "noRunYet", "lastRun", "leftOut", "request", "update",
  ];
  for (const k of keysUsed) assert.ok(english[`ops.scores.${k}`], `ops.scores.${k}`);
  for (const k of ["requested", "open", "recent", "noMigration"]) assert.ok(english[`ops.msg.league.${k}`], k);
  for (const part of ["title", "body", "action"]) assert.ok(english[`confirm.opsLeague.${part}`], part);
  assert.deepEqual(placeholdersIn(english["ops.scores.flag.overdue"]).sort(), ["games", "hours"]);
  assert.deepEqual(placeholdersIn(english["ops.scores.update"]), ["league"]);
  assert.ok(placeholdersIn(english["confirm.opsLeague.title"]).every((p) => ["title", "number", "echo"].includes(p)), "the dialog fills title, number and echo");
  assert.ok(placeholdersIn(english["confirm.opsLeague.body"]).every((p) => ["title", "number", "echo"].includes(p)));
  // an old French or Japanese entry that does exist must keep the English placeholders
  for (const k of Object.keys(english).filter((x) => /^(ops\.scores\.|ops\.msg\.league\.|ops\.issue\.scores|confirm\.opsLeague\.)/.test(x))) {
    for (const [name, dictionary] of Object.entries(dictionaries)) if (dictionary[k]) assert.deepEqual(placeholdersIn(dictionary[k] as string).sort(), placeholdersIn(english[k] as string).sort(), `${name} ${k}`);
  }
});

test("the badge of a league: red when failed or stale, amber for a warning, a skip or games without a score, green when fine", () => {
  const l = (over: Record<string, unknown>) => dash((p) => { p.scores.leagues[0] = stamp("nhl", over); }).latest!.payload.scores as never as { leagues: Parameters<typeof leagueTone>[0][] };
  const tone = (over: Record<string, unknown>) => leagueTone(l(over).leagues[0]);
  assert.equal(tone({}), "done");
  assert.equal(tone({ outcome: "failed" }), "stale");
  assert.equal(tone({ flags: ["stale"] }), "stale");
  assert.equal(tone({ outcome: "warning" }), "live");
  assert.equal(tone({ outcome: "skipped" }), "live");
  assert.equal(tone({ flags: ["overdue"] }), "live");
  assert.equal(tone({ outcome: "unknown", at: null, ok_at: null }), "");
});

const req = (id: number, league: string | null, status: string, finishedMinutesAgo: number | null = null) => ({
  id, league, requested_by: "john@example.test", requested_at: ago((finishedMinutesAgo ?? 0) + 1), status, started_at: null, finished_at: finishedMinutesAgo === null ? null : ago(finishedMinutesAgo), summary: null, release_number: null,
});
const scoreRequests = (...r: ReturnType<typeof req>[]) => dashboard.parse({ latest: null, history: [], requests: [], score_requests: r, server_now: AT }).score_requests;

test("Update now is switched off while any scores request is open, or the last one for that league ended under ten minutes ago", () => {
  const now = Date.parse(AT);
  assert.equal(scoreBlock([], "nhl", now), null);
  assert.equal(scoreBlock(scoreRequests(req(3, "nba", "queued")), "nhl", now), "open", "one request at a time, whatever the league");
  assert.equal(scoreBlock(scoreRequests(req(3, null, "running")), "nhl", now), "open");
  assert.equal(scoreBlock(scoreRequests(req(3, "nhl", "done", 3)), "nhl", now), "recent");
  assert.equal(scoreBlock(scoreRequests(req(3, "nhl", "done", 3)), "nba", now), null, "another league is free");
  assert.equal(scoreBlock(scoreRequests(req(3, "nhl", "done", 11)), "nhl", now), null);
  assert.equal(scoreBlock(scoreRequests(req(3, "nhl", "failed", 5), req(2, "nhl", "done", 500)), "nhl", now), "recent");
  assert.equal(openScoreRequest(scoreRequests(req(4, null, "queued"), req(3, "nhl", "done", 50)))?.id, 4);
  assert.equal(lastScoreRequest(scoreRequests(req(4, "nba", "done", 5), req(3, "nhl", "done", 50)), "nhl")?.id, 3, "the newest request that named the league");
  assert.equal(lastScoreRequest(scoreRequests(req(3, null, "done", 50)), "nhl"), null, "an all-leagues request is not a league's own");
});
