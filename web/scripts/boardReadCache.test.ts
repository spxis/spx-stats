import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { diskReadCache } from "./boardReadCache.ts";
import { boardList, boardMove, installBoardReadCache, readThrough } from "../src/lib/board/client.ts";

/** Run in web/: pnpm test:board. SUMILABU-15: the CLI's ETag cache. */

const TOKEN = "not-a-real-token-but-secret-shaped";
const realFetch = globalThis.fetch;
let dir = "";
let sent: { url: string; method: string; ifNoneMatch: string | null }[] = [];
let board: { etag: string; tickets: unknown[] } = { etag: '"v1"', tickets: [] };

function files(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "board-cache-"));
  process.env.SUMILABU_BOARD_URL = "https://board.test";
  process.env.SUMILABU_BOARD_TOKEN = TOKEN;
  delete process.env.SUMILABU_BOARD_PROJECT;
  sent = [];
  board = { etag: '"v1"', tickets: [{ id: "a", title: "First ticket on the board", status: "open" }] };
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    sent.push({ url, method: init.method ?? "GET", ifNoneMatch: headers.get("if-none-match") });
    if ((init.method ?? "GET") !== "GET") return new Response(JSON.stringify({ ok: true, ticket: { id: "a", status: "inProgress" } }), { status: 200 });
    if (headers.get("if-none-match") === board.etag) return new Response(null, { status: 304, headers: { etag: board.etag } });
    return new Response(JSON.stringify({ ok: true, tickets: board.tickets }), { status: 200, headers: { etag: board.etag } });
  }) as typeof fetch;
  installBoardReadCache(diskReadCache({ SUMILABU_BOARD_CACHE_DIR: dir }));
});

afterEach(() => {
  globalThis.fetch = realFetch;
  installBoardReadCache(null);
  rmSync(dir, { recursive: true, force: true });
});

test("the second read of an unchanged board sends its ETag and is answered from the saved copy", async () => {
  assert.equal((await boardList({ unfinished: true })).length, 1);
  assert.equal(sent[0].ifNoneMatch, null);
  assert.equal((await boardList({ unfinished: true })).length, 1);
  assert.equal(sent[1].ifNoneMatch, '"v1"');
  assert.equal(sent.length, 2);
});

test("a changed board is read again and the new answer is kept", async () => {
  await boardList();
  board = { etag: '"v2"', tickets: [{ id: "a", title: "First", status: "open" }, { id: "b", title: "Second", status: "open" }] };
  assert.equal((await boardList()).length, 2);
  assert.equal(sent[1].ifNoneMatch, '"v1"');
  assert.equal((await boardList()).length, 2);
  assert.equal(sent[2].ifNoneMatch, '"v2"');
});

test("a write is never cached and never sends an ETag", async () => {
  await boardList();
  await boardMove("a", "inProgress", "machine1");
  assert.equal(sent[1].method, "PATCH");
  assert.equal(sent[1].ifNoneMatch, null);
  assert.equal(files(dir).length, 1);
});

test("files are mode 600 in folders of mode 700, one folder per board, and hold no key", async () => {
  await boardList();
  await boardList({ unfinished: true });
  process.env.SUMILABU_BOARD_PROJECT = "modules";
  await boardList();
  const all = files(dir);
  assert.equal(all.length, 3);
  assert.deepEqual(readdirSync(dir).sort(), ["modules", "spx-stats"]);
  for (const file of all) {
    assert.equal(statSync(file).mode & 0o777, 0o600, file);
    const text = readFileSync(file, "utf8");
    assert.equal(text.includes(TOKEN), false);
    assert.equal(/bearer/i.test(text), false);
    assert.equal(file.includes(TOKEN), false);
  }
  for (const folder of [dir, join(dir, "spx-stats"), join(dir, "modules")]) assert.equal(statSync(folder).mode & 0o777, 0o700, folder);
});

test("each board and each read is kept apart", async () => {
  await boardList();
  process.env.SUMILABU_BOARD_PROJECT = "modules";
  await boardList();
  assert.equal(sent[1].ifNoneMatch, null, "another board's ETag is never sent");
});

test("turned off, nothing is written and no ETag is sent", async () => {
  installBoardReadCache(diskReadCache({ SUMILABU_BOARD_CACHE_DIR: dir, SUMILABU_BOARD_CACHE: "off" }));
  await boardList();
  await boardList();
  assert.equal(sent[1].ifNoneMatch, null);
  assert.equal(files(dir).length, 0);
});

test("a refused or failed read is not kept", async () => {
  const cache = diskReadCache({ SUMILABU_BOARD_CACHE_DIR: dir })!;
  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401, headers: { etag: '"x"' } })) as typeof fetch;
  const r = await readThrough("spx-stats", "https://board.test/api/v1/projects/spx-stats/tickets", { authorization: `Bearer ${TOKEN}` }, cache);
  assert.equal(r.status, 401);
  assert.equal(files(dir).length, 0);
});

test("a board name that is not a plain slug is never used as a folder", () => {
  const cache = diskReadCache({ SUMILABU_BOARD_CACHE_DIR: dir })!;
  cache.put("../escape", "https://board.test/x", { etag: '"a"', body: {} });
  assert.equal(cache.get("../escape", "https://board.test/x"), null);
  assert.equal(files(dir).length, 0);
});
