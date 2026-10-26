import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mock, test } from "node:test";
import { RefusedError, handleLiveProgress, handleLiveRequest, progressFromRow, refusalText, showLiveControls, type Progress } from "../src/lib/liveAdmin.ts";
import { PROGRESS_GIVE_UP_MS, PROGRESS_POLL_MS, describe, describeRow, estimate, estimateText, parseLiveRequest, rawFromForm, sourceChoices } from "../src/lib/liveRequest.ts";
import { SOURCE_REGISTRY } from "../src/lib/liveSources.ts";
import { requestBlock } from "../src/lib/releases/rules.ts";

/** Run in web/: pnpm test:livereq */
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");
const TODAY = "2026-10-26";
const ADMIN = { email: "john@example.test", admin: true };

test("the picker's registry is the registry: web/src/lib/liveSources.ts is what scripts/daily/sources.py --web prints", () => {
  const out = execFileSync("python3", ["-I", join(HERE, "..", "..", "scripts", "daily", "sources.py"), "--web"], { encoding: "utf8" });
  assert.equal(out, read("lib/liveSources.ts"), "regenerate: python3 -I scripts/daily/sources.py --web > web/src/lib/liveSources.ts");
});

test("only green or grey sources with a score parser can be ticked; a confirm-only or forbidden source is greyed with its terms note", () => {
  const { tickable, greyed } = sourceChoices();
  assert.deepEqual(tickable.map((s) => s.id).sort(), ["balldontlie", "nflverse", "wikipedia"]);
  assert.ok(tickable.every((s) => s.tier === "green" || s.tier === "grey"));
  for (const id of ["nhl_api", "yahoo_sports", "usatoday", "espn", "nba_com"]) {
    const row = greyed.find((s) => s.id === id);
    assert.ok(row, `${id} is listed, greyed out`);
    assert.ok(!row.selectable && row.reason.length > 20, `${id} carries its terms note`);
  }
  assert.ok(!greyed.some((s) => tickable.includes(s)));
  assert.match(greyed.find((s) => s.id === "yahoo_sports")!.reason, /automated means/);
});

test("a request is checked as if forged: scope, league, day, game and every source", () => {
  const ok = (raw: unknown) => parseLiveRequest(raw, TODAY);
  const good = ok({ scope: "day", league: "nhl", day: "2026-10-25", sources: ["wikipedia", "wikipedia", "balldontlie"] });
  assert.ok(good.ok);
  if (good.ok) assert.deepEqual(good.value, { scope: "day", league: "nhl", day: "2026-10-25", game: null, sources: ["balldontlie", "wikipedia"], settle: false });
  assert.ok(ok({ scope: "game", game: "123", sources: ["nflverse"] }).ok);
  assert.ok(ok({ scope: "main5", sources: ["wikipedia"], settle: true }).ok);
  assert.ok(ok({ scope: "all", sources: ["wikipedia"] }).ok);
  assert.ok(ok({ scope: "league", league: "cfl", sources: ["wikipedia"], settle: true }).ok);
  for (const source of ["nhl_api", "mlb_statsapi", "yahoo_sports", "usatoday", "espn", "sports_reference", "nhl_com", "wikidata", "retrosheet", "wnba_stats", "nope", "Wikipedia", "x", 7, null]) {
    assert.equal(ok({ scope: "main5", sources: ["wikipedia", source] }).ok, false, `${String(source)} is refused`);
  }
  const red = ok({ scope: "main5", sources: ["nhl_api"] });
  assert.ok(!red.ok && /cannot be ticked/.test(red.error) && /Confirm-only/.test(red.error), "the refusal gives the terms note");
  assert.equal(ok({ scope: "main5", sources: [] }).ok, false, "at least one source");
  assert.equal(ok({ scope: "main5" }).ok, false);
  assert.equal(ok({ scope: "main5", sources: Array.from({ length: 9 }, () => "wikipedia") }).ok, false, "more than eight entries is not a picker's answer");
  assert.equal(ok({ scope: "season", sources: ["wikipedia"] }).ok, false);
  assert.equal(ok({ scope: "day", league: "wnba", day: TODAY, sources: ["wikipedia"] }).ok, false, "only the main five");
  assert.equal(ok({ scope: "day", league: "nhl", day: "2026-10-01", sources: ["wikipedia"] }).ok, false, "older than the live layer keeps");
  assert.equal(ok({ scope: "day", league: "nhl", day: "2026-10-28", sources: ["wikipedia"] }).ok, false, "after tomorrow");
  assert.equal(ok({ scope: "day", league: "nhl", day: "2026-02-30", sources: ["wikipedia"] }).ok, false, "not a day");
  assert.equal(ok({ scope: "game", game: "0", sources: ["wikipedia"] }).ok, false);
  assert.equal(ok({ scope: "game", game: "12; drop", sources: ["wikipedia"] }).ok, false);
  assert.equal(ok({ scope: "game", game: 99999999999, sources: ["wikipedia"] }).ok, false);
  assert.equal(ok({ scope: "game", game: 5, sources: ["wikipedia"], settle: true }).ok, false, "one game is never the slow path");
  assert.equal(ok({ scope: "day", league: "nhl", day: TODAY, sources: ["wikipedia"], settle: true }).ok, false);
  assert.equal(ok({ scope: "main5", league: "nhl", sources: ["wikipedia"] }).ok, false);
  assert.equal(ok("main5").ok, false);
  assert.equal(ok(null).ok, false);
});

test("the form of the scores update dialog means one request: sport, main five, today's games, one game", () => {
  const form = (o: Record<string, string>, sources = ["wikipedia"]) => ({ get: (k: string) => o[k] ?? null, getAll: (k: string) => (k === "sources" ? sources : []) });
  assert.deepEqual(rawFromForm(form({ granularity: "league", league: "nba" }), TODAY), { scope: "league", league: "nba", sources: ["wikipedia"], settle: true });
  assert.deepEqual(rawFromForm(form({ granularity: "day", league: "nhl" }), TODAY), { scope: "day", league: "nhl", day: TODAY, sources: ["wikipedia"], settle: false });
  assert.deepEqual(rawFromForm(form({ granularity: "game", game: "42" }), TODAY), { scope: "game", game: "42", sources: ["wikipedia"], settle: false });
  assert.equal((rawFromForm(form({ granularity: "all" }), TODAY) as { settle: boolean }).settle, true);
  assert.equal(rawFromForm(form({}), TODAY), null, "an old form with no choice is the old request");
  for (const g of ["league", "day", "game", "all", "main5"]) {
    const raw = rawFromForm(form({ granularity: g, league: "nhl", game: "5" }, ["nhl_api"]), TODAY);
    assert.equal(parseLiveRequest(raw, TODAY).ok, false, `${g} with a forbidden source is refused`);
  }
});

test("the dialog says before the click what each source will be asked", () => {
  const one = estimate({ scope: "game", league: "nhl", sources: ["wikipedia", "balldontlie"] });
  assert.deepEqual(one.map((c) => [c.source, c.min, c.max]), [["wikipedia", 1, 2], ["balldontlie", 1, 3]]);
  const five = estimate({ scope: "main5", league: null, sources: ["wikipedia", "balldontlie", "nflverse"] });
  const bdl = five.find((c) => c.source === "balldontlie")!;
  assert.equal(bdl.spacing, 13);
  assert.equal(bdl.min, 3, "balldontlie reads NBA, MLB and NFL only");
  assert.equal(five.find((c) => c.source === "nflverse")!.max, 1);
  assert.ok(estimate({ scope: "league", league: "nhl", sources: ["balldontlie"] }).length === 0, "balldontlie does not read the NHL");
  assert.match(estimateText(five), /13 s apart/);
  assert.match(estimateText([]), /No request/);
  const day = estimate({ scope: "day", league: "nhl", sources: ["wikipedia"] }, 3);
  assert.equal(day[0].max, 1 + Math.ceil(6 / 10), "a day of 3 games reads at most 6 club pages");
  assert.equal(describe({ scope: "day", league: "nhl", day: "2026-10-25", game: null }), "NHL games on 2026-10-25");
  assert.equal(describeRow({ scope: "game", game_id: 7 }), "game 7");
  assert.equal(describeRow({ scope: null, league: "cfl" }), "CFL");
  assert.equal(describeRow({}), "all leagues");
});

test("a visitor sees no controls and can ask for nothing; an admin can", async () => {
  assert.equal(showLiveControls(null), false);
  assert.equal(showLiveControls(undefined), false);
  assert.equal(showLiveControls({ user: null }), false, "signed out");
  assert.equal(showLiveControls({ user: { admin: false } }), false, "signed in but not an admin");
  assert.equal(showLiveControls({ user: { admin: true } }), true);

  let queued = 0;
  const deps = { queue: async () => { queued++; return 41; } };
  const base = { devLogin: false, sameOrigin: true, today: TODAY, body: { scope: "main5", sources: ["wikipedia"] } };
  for (const user of [null, { email: "v@example.test", admin: false }]) {
    const r = await handleLiveRequest({ ...base, user }, deps);
    assert.equal(r.status, 404, "a visitor gets a 404, as for the admin pages");
  }
  assert.equal(queued, 0, "and nothing is queued for them");
  assert.equal((await handleLiveRequest({ ...base, user: ADMIN, sameOrigin: false }, deps)).status, 403, "a request from another site");
  assert.equal((await handleLiveRequest({ ...base, user: ADMIN, devLogin: true }, deps)).status, 403, "the dev sign-in never writes");
  assert.equal((await handleLiveRequest({ ...base, user: ADMIN, body: { scope: "main5", sources: ["nhl_api"] } }, deps)).status, 400, "a forbidden source");
  assert.equal((await handleLiveRequest({ ...base, user: ADMIN, body: null }, deps)).status, 400);
  assert.equal(queued, 0);
  const ok = await handleLiveRequest({ ...base, user: ADMIN }, deps);
  assert.deepEqual([ok.status, ok.body], [200, { ok: true, id: 41 }]);
  assert.equal(queued, 1, "one request is one queue call");
  const refused = await handleLiveRequest({ ...base, user: ADMIN }, { queue: async () => { throw new RefusedError("a request is already open"); } });
  assert.equal(refused.status, 429);
  assert.match(String((refused.body as { error: string }).error), /already running/);
  assert.equal((await handleLiveRequest({ ...base, user: ADMIN }, { queue: async () => { throw new Error("down"); } })).status, 502);
  assert.match(refusalText("wait about 30 seconds after the last request for this"), /30 seconds/);
  assert.match(refusalText("wait about 10 minutes after the last request"), /10 minutes/);
});

test("progress is one read of one row for an admin only; a visitor's question reads nothing", async () => {
  let reads = 0;
  const found: Progress = { status: "done", summary: "2 games", items: [[1, "updated", "x"]] };
  const deps = { read: async () => { reads++; return found; } };
  assert.equal((await handleLiveProgress({ user: null, id: "5" }, deps)).status, 404);
  assert.equal((await handleLiveProgress({ user: { email: "v", admin: false }, id: "5" }, deps)).status, 404);
  assert.equal(reads, 0, "Turso is not asked for a visitor");
  assert.equal((await handleLiveProgress({ user: ADMIN, id: "5; drop" }, deps)).status, 400);
  assert.equal(reads, 0);
  const r = await handleLiveProgress({ user: ADMIN, id: "5" }, deps);
  assert.deepEqual([r.status, r.body, reads], [200, found, 1]);
  assert.deepEqual((await handleLiveProgress({ user: ADMIN, id: "6" }, { read: async () => null })).body, { status: "waiting", summary: null, items: [] }, "not started yet");
  assert.equal((await handleLiveProgress({ user: ADMIN, id: "6" }, { read: async () => { throw new Error("x"); } })).status, 502);
  assert.deepEqual(progressFromRow({ status: "running", summary: null, items: null }), { status: "running", summary: null, items: [] });
  assert.deepEqual(progressFromRow({ status: "done", summary: "ok", items: '[[3,"failed","boom"],["x"],[4,"updated"]]' }).items, [[3, "failed", "boom"], [4, "updated", ""]]);
  assert.equal(progressFromRow({ status: "done", summary: "ok", items: "not json" }).items.length, 0);
});

test("a live refresh does not wait for the slow path and the slow path does not wait for it", () => {
  const now = Date.parse("2026-10-26T12:00:00Z");
  const q = (kind: string, status: string) => ({ id: 1, status, requested_at: "2026-10-26T11:59:00Z", finished_at: null, kind, league: null });
  assert.equal(requestBlock([q("live", "running")], now, 10, "scores"), null);
  assert.equal(requestBlock([q("scores", "running")], now, 10, "live"), null);
  assert.match(requestBlock([q("scores", "running")], now, 10, "scores") ?? "", /Wait for it/);
  assert.match(requestBlock([q("live", "queued")], now, 10, "live") ?? "", /Wait for it/);
});

test("the controls are drawn by the browser for an admin only: the kept page carries none, and a view fetches nothing", () => {
  const bar = read("components/LiveAdmin.tsx");
  for (const name of ["LiveAdminBar", "LiveGameRefresh"]) {
    const body = bar.slice(bar.indexOf(`export function ${name}`));
    const guard = body.indexOf("showLiveControls(account)");
    const markup = body.indexOf("return (");
    assert.ok(guard > 0 && guard < markup, `${name} asks the account before it draws anything`);
    assert.match(body.slice(guard - 5, guard + 120), /\) return null;/, `${name} returns nothing for everyone else`);
  }
  assert.ok(!/fetch\(/.test(bar) && !/useEffect/.test(bar), "drawing the controls makes no request (the request is made by a press, in the dialog)");
  assert.ok(!/Refresh/.test(read("components/Scoreboard.tsx").replace(/LiveGameRefresh/g, "")), "the scoreboard page itself holds no button text");
  assert.ok(!/LiveAdmin|LiveGameRefresh|LiveRefreshDialog/.test(read("components/LiveScores.tsx")), "the visitor's overlay knows nothing of the controls");
  const shell = read("components/LiveAdmin.tsx");
  assert.match(shell, /import\("\.\/LiveRefreshDialog"\)/, "the dialog and the registry load when a button is pressed");
  assert.ok(!/^import (?!type).*from "\.\/(LiveRefreshDialog|SourcePicker)"/m.test(shell) && !/liveSources|lib\/liveRequest|lib\/liveAdmin/.test(shell + read("lib/liveJob.ts")), "and neither is the registry or the rules: the shell imports only lib/liveScope, so a visitor's page does not carry them");
});

test("the routes are admin only and write one row; no route runs a query or reaches a score source", () => {
  for (const file of ["app/api/admin/live/route.ts", "app/api/admin/live/[id]/route.ts"]) {
    const src = read(file);
    assert.match(src, /currentUser\(\)/, `${file} asks who is signed in`);
    assert.match(src, /handleLive(Request|Progress)/);
    assert.ok(!/wikipedia|balldontlie|nflverse|api-web|nhle|https?:\/\//.test(src.replace(/\/\*[\s\S]*?\*\//g, "")), `${file} names no source`);
  }
  assert.match(read("app/api/admin/live/route.ts"), /dynamic = "force-dynamic"/);
});

test("the page asks how a request goes no faster than every 15 seconds, never from a hidden tab, and gives up", async (t) => {
  assert.ok(PROGRESS_POLL_MS >= 15_000);
  assert.ok(PROGRESS_GIVE_UP_MS <= 30 * 60_000);
  const src = read("lib/liveJob.ts");
  assert.ok(!/setInterval/.test(src), "no timer that repeats by itself");
  const calls: string[] = [];
  const realFetch = globalThis.fetch;
  const doc = { visibilityState: "visible", addEventListener() {} };
  Object.assign(globalThis, { document: doc });
  globalThis.fetch = (async (url: string) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ status: "running", summary: null, items: [] }));
  }) as typeof fetch;
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const job = await import("../src/lib/liveJob.ts");
  try {
    job.beginJob(9, "game 9");
    t.mock.timers.tick(14_000);
    assert.equal(calls.length, 0, "nothing before 15 seconds");
    t.mock.timers.tick(1_000);
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(calls, ["/api/admin/live/9"], "one question after 15 seconds");
    assert.equal(job.getJob()?.status, "running");
    t.mock.timers.tick(14_000);
    assert.equal(calls.length, 1);
    doc.visibilityState = "hidden";
    t.mock.timers.tick(60_000);
    await new Promise((r) => setImmediate(r));
    assert.equal(calls.length, 1, "a hidden tab asks nothing");
    job.clearJob();
  } finally {
    t.mock.timers.reset();
    globalThis.fetch = realFetch;
    Reflect.deleteProperty(globalThis, "document");
    mock.restoreAll();
  }
});

test("the registry and the runner agree on the score sources", () => {
  const py = readFileSync(join(HERE, "..", "..", "scripts", "daily", "run.py"), "utf8");
  const m = /LIVE_SOURCES = \(([^)]*)\)/.exec(py);
  assert.ok(m);
  const ids = [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
  assert.deepEqual(ids.sort(), sourceChoices().tickable.map((s) => s.id).sort(), "run.py LIVE_SOURCES is what the picker lets an admin tick");
  assert.ok(ids.every((id) => SOURCE_REGISTRY.find((s) => s.id === id)?.selectable));
});
