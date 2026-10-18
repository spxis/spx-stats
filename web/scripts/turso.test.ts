import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { ApiError } from "../src/lib/api/error.ts";
import { withChecked } from "../src/lib/turso/checked.ts";
import { jsonStrings, tursoConfigured, tursoQuery } from "../src/lib/turso/client.ts";

type Call = { url: string; init: RequestInit };
const calls: Call[] = [];
const realFetch = globalThis.fetch;

const answer = (cols: string[], rows: unknown[][]) =>
  new Response(JSON.stringify({ results: [{ type: "ok", response: { type: "execute", result: { cols: cols.map((name) => ({ name })), rows } } }, { type: "ok", response: { type: "close" } }] }));
const int = (n: number) => ({ type: "integer", value: String(n) });

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

test("a query is one pipeline request with the token, bound arguments and the cache tags, and its cells are decoded", async () => {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return answer(["a", "b", "c", "d"], [[int(7), { type: "text", value: "x" }, { type: "null" }, { type: "float", value: 1.5 }]]);
  }) as typeof fetch;
  const rows = await tursoQuery("select a, b, c, d from t where k = ? and j = ?", ["v", 3], { tables: ["meta_verification"] });
  assert.deepEqual(rows, [{ a: 7, b: "x", c: null, d: 1.5 }]);
  assert.equal(calls[0].url, "https://example-db.turso.io/v2/pipeline");
  assert.equal((calls[0].init.headers as Record<string, string>).authorization, "Bearer secret-token");
  const body = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(body.requests[0].stmt.args, [{ type: "text", value: "v" }, int(3)]);
  assert.equal(body.requests[0].stmt.sql.includes("secret-token"), false);
  assert.equal(calls[0].init.method, "POST");
  const next = (calls[0].init as { next?: { tags?: string[] } }).next;
  assert.deepEqual(next?.tags, ["turso", "turso:meta_verification"]);
  assert.equal(calls[0].init.cache, "force-cache");
});

test("a live query is never cached", async () => {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return answer([], []);
  }) as typeof fetch;
  await tursoQuery("select 1", [], { tables: [], live: true });
  assert.equal(calls[0].init.cache, "no-store");
});

test("without Turso set up the read says so and is not transient; a 5xx is transient", async () => {
  delete process.env.TURSO_DATABASE_URL;
  assert.equal(tursoConfigured(), false);
  await assert.rejects(() => tursoQuery("select 1", [], { tables: [] }), (e) => e instanceof ApiError && e.transient === false);
  process.env.TURSO_DATABASE_URL = "http://127.0.0.1:7742";
  globalThis.fetch = (async () => new Response("down", { status: 503 })) as typeof fetch;
  await assert.rejects(() => tursoQuery("select 1", [], { tables: [] }), (e) => e instanceof ApiError && e.transient === true && e.status === 503);
});

test("an error from Turso is a failed read, not an empty list", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ results: [{ type: "error", error: { message: "no such table: x" } }] }))) as typeof fetch;
  await assert.rejects(() => tursoQuery("select * from x", [], { tables: [] }), /no such table/);
});

test("the check of a game is filled in from Turso, and games without one are null", async () => {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return answer(["entity_id", "checked"], [[int(2), int(1)], [int(3), int(-1)]]);
  }) as typeof fetch;
  const games = [{ game_id: 1, checked: null }, { game_id: 2, checked: null }, { game_id: 3, checked: 1 }];
  const out = await withChecked("games", games);
  assert.deepEqual(out.map((g) => g.checked), [null, 1, -1]);
  const body = JSON.parse(String(calls[0].init.body));
  assert.ok(body.requests[0].stmt.sql.includes("in (1,2,3)"));
  assert.deepEqual(body.requests[0].stmt.args, [{ type: "text", value: "game" }]);
  assert.deepEqual(await withChecked("standings", games), games, "other views are left alone");
  process.env.TURSO_DATABASE_URL = "";
  assert.deepEqual(await withChecked("games", games), games, "without Turso the view's own value stands");
});

test("a JSON text column is a list of strings", () => {
  assert.deepEqual(jsonStrings('["hockey","baseball"]'), ["hockey", "baseball"]);
  assert.equal(jsonStrings(null), null);
  assert.equal(jsonStrings("not json"), null);
});
