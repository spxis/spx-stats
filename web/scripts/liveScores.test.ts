import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, test } from "node:test";
import { LIVE_POLL_MS, byGame, confidence, inLiveWindow, liveCandidates, liveView, shouldPoll } from "../src/lib/liveScores.ts";
import { liveRowSchema } from "../src/lib/liveRowSchema.ts";
import { LIVE_SHARE_SECONDS, getLiveScores } from "../src/lib/turso/live.ts";

/** Run in web/: pnpm test:live */
const TODAY = "2026-10-25";
const realFetch = globalThis.fetch;
const calls: { url: string; init: RequestInit }[] = [];

const COLS = ["game_id", "status", "home_score", "away_score", "overtime", "period", "disputed", "ready", "n_sources", "n_agree", "confirm_agree", "confirm_differ", "sources", "fetched_at"];
const int = (n: number) => ({ type: "integer", value: String(n) });
const text = (s: string) => ({ type: "text", value: s });
const nul = { type: "null" };
const SOURCES = JSON.stringify([{ s: "Wikipedia: A", h: 3, a: 2, at: "2026-10-25T10:00:00Z" }, { s: "Wikipedia: B", h: 3, a: 2, at: "2026-10-25T10:01:00Z" }]);
const cells = (id: number, o: { status?: string; h?: number | null; a?: number | null; disputed?: number; n?: number; agree?: number; ca?: number; cd?: number } = {}) => [
  int(id), text(o.status ?? "final"), o.h === null ? nul : int(o.h ?? 3), o.a === null ? nul : int(o.a ?? 2), nul, nul, int(o.disputed ?? 0), int(0), int(o.n ?? 2), int(o.agree ?? 2), int(o.ca ?? 0), int(o.cd ?? 0), text(SOURCES), text("2026-10-25T10:01:00Z"),
];
const answer = (rows: unknown[][]) =>
  new Response(JSON.stringify({ results: [{ type: "ok", response: { type: "execute", result: { cols: COLS.map((name) => ({ name })), rows } } }, { type: "ok", response: { type: "close" } }] }));

beforeEach(() => {
  calls.length = 0;
  process.env.TURSO_DATABASE_URL = "libsql://example-db.turso.io";
  process.env.TURSO_AUTH_TOKEN = "secret-token";
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
});

const stub = (rows: unknown[][]) => {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return answer(rows);
  }) as typeof fetch;
};

test("a scoreboard view makes ONE Turso read for any number of games, shares it for 30 seconds, and asks no score source", async () => {
  stub(Array.from({ length: 30 }, (_, i) => cells(1000 + i)));
  const got = await getLiveScores("nhl", TODAY, TODAY);
  assert.equal(got.rows.length, 30);
  assert.equal(calls.length, 1, "one request for 30 games");
  assert.equal(new URL(calls[0].url).hostname, "example-db.turso.io", "the only host asked is Turso");
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.requests.filter((r: { type: string }) => r.type === "execute").length, 1, "one statement");
  assert.match(body.requests[0].stmt.sql, /from live_score where league = \? and game_date = \?/);
  assert.equal(LIVE_SHARE_SECONDS, 30);
  const next = (calls[0].init as { next?: { revalidate?: number; tags?: string[] } }).next;
  assert.equal(next?.revalidate, 30, "kept 30 seconds and shared by every visitor");
  assert.deepEqual(next?.tags, ["turso", "turso:live_score"]);
  assert.equal(calls[0].init.cache, "force-cache");
});

test("a day outside the window, a site without Turso and a table nobody has written read nothing more", async () => {
  stub([]);
  assert.deepEqual((await getLiveScores("nhl", "2026-10-01", TODAY)).rows, []);
  assert.deepEqual((await getLiveScores("nhl", "2026-10-30", TODAY)).rows, []);
  assert.equal(calls.length, 0, "no read for a day the writer does not keep");
  delete process.env.TURSO_DATABASE_URL;
  assert.deepEqual((await getLiveScores("nhl", TODAY, TODAY)).rows, []);
  assert.equal(calls.length, 0);
  process.env.TURSO_DATABASE_URL = "http://127.0.0.1:7748";
  globalThis.fetch = (async () => new Response(JSON.stringify({ results: [{ type: "error", error: { message: "SQLite error: no such table: live_score" } }] }))) as typeof fetch;
  assert.deepEqual((await getLiveScores("nhl", TODAY, TODAY)).rows, []);
});

test("a row is checked: states, flags, and the source list", () => {
  const ok = liveRowSchema.parse(Object.fromEntries(COLS.map((c, i) => [c, [1, "final", 3, 2, null, null, 0, 0, 2, 2, 0, 0, SOURCES, "x"][i]])));
  assert.equal(ok.disputed, false);
  assert.equal(ok.sources.length, 2);
  assert.throws(() => liveRowSchema.parse({ ...ok, status: "scheduled" }));
  assert.throws(() => liveRowSchema.parse({ ...ok, sources: "not json" }));
});

test("the wording ladder: one source, all agree, a majority, and a tie that picks no score", () => {
  assert.equal(confidence({ disputed: false, n_sources: 1, n_agree: 1 }), "single");
  assert.equal(confidence({ disputed: false, n_sources: 3, n_agree: 3 }), "all");
  assert.equal(confidence({ disputed: false, n_sources: 6, n_agree: 5 }), "partial");
  assert.equal(confidence({ disputed: true, n_sources: 2, n_agree: 1 }), "disputed");
  const row = (o: Record<string, unknown>) => liveRowSchema.parse({ ...Object.fromEntries(COLS.map((c, i) => [c, [1, "final", 3, 2, 1, null, 0, 0, 2, 2, 1, 0, SOURCES, "x"][i]])), ...o });
  const v = liveView(row({}));
  assert.deepEqual([v.state, v.home, v.away, v.overtime, v.agree, v.of, v.differ, v.outsideAgree], ["final", 3, 2, true, 2, 2, 0, 1]);
  const d = liveView(row({ disputed: 1, home_score: null, away_score: null, n_agree: 1 }));
  assert.deepEqual([d.confidence, d.home, d.away, d.sources.length], ["disputed", null, null, 2], "disputed shows no score and lists every source");
});

test("only the games the archive has not settled are asked about, and only for days the writer keeps", () => {
  const g = (game_id: number, status: string, h: number | null, a: number | null) => ({ game_id, status, home_score: h, away_score: a });
  assert.deepEqual(liveCandidates([g(1, "final", 3, 2), g(2, "scheduled", null, null), g(3, "final", null, null), g(4, "in_progress", 1, 0)]), [2, 3, 4]);
  assert.equal(inLiveWindow("2026-10-18", TODAY), true);
  assert.equal(inLiveWindow("2026-10-17", TODAY), false);
  assert.equal(inLiveWindow("2026-10-26", TODAY), true);
  assert.equal(inLiveWindow("2026-10-27", TODAY), false);
  assert.equal(inLiveWindow("2013-04-01", TODAY), false, "an old scoreboard never asks");
});

test("polling: not for far days, not once every game has a final live row, never faster than a minute", () => {
  const row = (id: number, status: string) => liveRowSchema.parse(Object.fromEntries(COLS.map((c, i) => [c, [id, status, 1, 0, null, null, 0, 0, 1, 1, 0, 0, SOURCES, "x"][i]])));
  const rows = byGame([row(1, "final"), row(2, "in_progress"), row(9, "final")], [1, 2]);
  assert.deepEqual([...rows.keys()].sort(), [1, 2], "rows of other games are ignored");
  assert.equal(shouldPoll([1, 2], rows, TODAY, TODAY), true);
  assert.equal(shouldPoll([1], rows, TODAY, TODAY), false);
  assert.equal(shouldPoll([1, 2, 3], rows, TODAY, TODAY), true, "a game with no live row yet may still get one");
  assert.equal(shouldPoll([2], rows, "2026-10-20", TODAY), false, "a scoreboard from last week is read once");
  assert.ok(LIVE_POLL_MS >= 15_000 && LIVE_POLL_MS === 60_000);
});

test("a visitor gets the badge and the sources and nothing to press; the code that reads the layer has no admin control", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  const files = { component: read("../src/components/LiveScores.tsx"), lib: read("../src/lib/liveScores.ts"), route: read("../src/app/api/live/[league]/[date]/route.ts"), server: read("../src/lib/turso/live.ts") };
  for (const [name, src] of Object.entries(files)) {
    assert.doesNotMatch(src, /useAccount|isAdmin|requireAdmin|<button|onClick|AdminBar/, `${name}: no admin or control`);
    assert.doesNotMatch(src, /api-web\.nhle|statsapi|espn|wikipedia\.org|balldontlie|nflverse|yahoo|usatoday|sportsdata/i, `${name}: names no score source`);
  }
  assert.match(files.component, /live\.unofficial/, "the badge is drawn for everyone");
  assert.match(files.component, /fetch\(`\/api\/live\//, "the browser's only request is the cached route");
  assert.equal((files.component.match(/fetch\(/g) ?? []).length, 1);
  assert.doesNotMatch(files.route, /method|POST|PUT|DELETE/, "the route only reads");
  const board = read("../src/components/Scoreboard.tsx");
  assert.doesNotMatch(board, /turso/i, "the page itself reads no Turso: a view adds no server read");
  assert.match(board, /LiveState/);
});
