import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { boardEdit, boardHistory, boardResolveId } from "../src/lib/board/client.ts";
import { appendedDetail, editProblems, looksLikeShortId, ticketLine, type Ticket } from "../src/lib/board/rules.ts";

/** Run in web/: pnpm test:board */

const realFetch = globalThis.fetch;
let answer: (url: string, init: RequestInit) => { status: number; body: unknown };
let calls: { url: string; method: string; body: unknown }[] = [];

beforeEach(() => {
  process.env.SUMILABU_BOARD_URL = "https://board.test";
  process.env.SUMILABU_BOARD_TOKEN = "not-a-real-token";
  calls = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
    const r = answer(url, init);
    return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body), { status: r.status });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const ticket = (extra: Partial<Ticket> = {}): Ticket =>
  ({ id: "cmvaaaaaaaaaaaaaaaaaaaaaa", projectKey: "spx-stats", title: "An existing ticket", detail: null, kind: "feature", status: "open", claimedBy: null, claimedAt: null, movedAt: "2026-10-01T00:00:00.000Z", ...extra }) as Ticket;

test("short ids and cuids are told apart", () => {
  assert.equal(looksLikeShortId("SPX-142"), true);
  assert.equal(looksLikeShortId("spx-1"), true);
  assert.equal(looksLikeShortId("cmvc8rjxx001ejj06tkqi36qd"), false);
  assert.equal(looksLikeShortId("SPX-0"), false);
  assert.equal(looksLikeShortId("SPX-12a"), false);
});

test("edit limits match add", () => {
  assert.equal(editProblems({ title: "short" }).length, 1);
  assert.equal(editProblems({ title: "t".repeat(121) }).length, 1);
  assert.equal(editProblems({ title: "t".repeat(120), detail: "d".repeat(4000) }).length, 0);
  assert.equal(editProblems({ detail: "d".repeat(4001) }).length, 1);
  assert.equal(editProblems({}).length, 0);
});

test("append goes after the detail with a blank line", () => {
  assert.equal(appendedDetail("First.", " Second. "), "First.\n\nSecond.");
  assert.equal(appendedDetail(null, "Only."), "Only.");
  assert.equal(appendedDetail("  ", "Only."), "Only.");
});

test("the list line leads with the short id when there is one", () => {
  assert.match(ticketLine(ticket({ shortId: "SPX-7" })), /^SPX-7\s+cmvaaaa/);
  assert.match(ticketLine(ticket()), /^cmvaaaa/);
});

test("a short id resolves through the list to the whole cuid", async () => {
  answer = () => ({ status: 200, body: { tickets: [ticket({ shortId: "SPX-1" }), ticket({ id: "cmvbbbbbbbbbbbbbbbbbbbbbb", shortId: "SPX-2" })] } });
  assert.equal(await boardResolveId("spx-2"), "cmvbbbbbbbbbbbbbbbbbbbbbb");
  assert.equal(await boardResolveId("SPX-9"), "SPX-9");
  assert.equal(await boardResolveId("cmvcccccccccccccccccccccc"), "cmvcccccccccccccccccccccc");
  assert.equal(calls.length, 2, "a cuid never asks the board");
});

test("an older Sumilabu without short ids says so", async () => {
  answer = () => ({ status: 200, body: { tickets: [ticket()] } });
  await assert.rejects(boardResolveId("SPX-1"), /no short ids yet/);
});

test("an edit sends only the words and reports the new ticket", async () => {
  answer = () => ({ status: 200, body: { ok: true, ticket: ticket({ title: "A better title here" }) } });
  const out = await boardEdit("cmvaaaaaaaaaaaaaaaaaaaaaa", { title: "A better title here" }, "machine2");
  assert.equal(out.ok, true);
  assert.deepEqual(calls[0].body, { title: "A better title here" });
  assert.equal(calls[0].method, "PATCH");
});

test("an edit the board ignored is reported as unsupported, not done", async () => {
  answer = () => ({ status: 200, body: { ok: true, ticket: ticket() } });
  const out = await boardEdit("cmvaaaaaaaaaaaaaaaaaaaaaa", { title: "A better title here" }, "machine2");
  assert.equal(out.ok === false && out.reason, "unsupported");
  answer = () => ({ status: 400, body: { ok: false, error: "invalid_payload" } });
  const refused = await boardEdit("cmvaaaaaaaaaaaaaaaaaaaaaa", { detail: "More words" }, "machine2");
  assert.equal(refused.ok === false && refused.reason, "unsupported");
});

test("a done ticket, a missing one and a cap are each said in words", async () => {
  answer = () => ({ status: 409, body: { ok: false, error: "done" } });
  const done = await boardEdit("x", { title: "A better title here" }, "m");
  assert.ok(!done.ok && done.reason === "done" && /release record/.test(done.message));
  answer = () => ({ status: 404, body: { ok: false, error: "missing" } });
  assert.equal((await boardEdit("x", { title: "A better title here" }, "m")).ok, false);
  answer = () => ({ status: 422, body: { ok: false, problems: ["too long"] } });
  const capped = await boardEdit("x", { title: "A better title here" }, "m");
  assert.deepEqual(!capped.ok && capped.reason === "invalid" && capped.problems, ["too long"]);
});

test("history: entries, a missing ticket, and a Sumilabu without it", async () => {
  answer = () => ({ status: 200, body: { ok: true, edits: [{ field: "title", oldValue: "a", newValue: "b", editedBy: "m", editedAt: "2026-10-18T00:00:00.000Z" }] } });
  assert.equal(((await boardHistory("x")) as unknown[]).length, 1);
  answer = () => ({ status: 404, body: { ok: false, error: "missing" } });
  assert.equal(await boardHistory("x"), "missing");
  answer = () => ({ status: 404, body: "<html>Not found</html>" });
  assert.equal(await boardHistory("x"), null);
});
