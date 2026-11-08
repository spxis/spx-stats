import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { boardAddNote, boardEdit, boardGet, boardHistory, boardNotes, boardRelate, boardResolveId, boardSetParent } from "../src/lib/board/client.ts";
import { CAPS, draftProblems, editProblems, looksLikeShortId, noteProblems, ticketLine, underParents, type Ticket } from "../src/lib/board/rules.ts";

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
  assert.equal(editProblems({ title: "t".repeat(120), detail: "d".repeat(16000) }).length, 0);
  assert.equal(editProblems({ detail: "d".repeat(16001) }).length, 1);
  assert.equal(CAPS.detail, 16000);
  assert.equal(draftProblems({ title: "A fine title", detail: "d".repeat(16001), askedBy: "" }).length, 1);
  assert.equal(editProblems({}).length, 0);
});

test("a note has words and fits the cap", () => {
  assert.equal(noteProblems("  ").length, 1);
  assert.equal(noteProblems("n".repeat(16000)).length, 0);
  assert.equal(noteProblems("n".repeat(16001)).length, 1);
});

test("a child prints under its parent when both are listed, and stays put otherwise", () => {
  const a = ticket({ id: "a", title: "Parent ticket" });
  const b = ticket({ id: "b", title: "Other ticket" });
  const c = ticket({ id: "c", title: "Child ticket", parentId: "a" });
  const d = ticket({ id: "d", title: "Orphan ticket", parentId: "gone" });
  const e = ticket({ id: "e", title: "Grandchild", parentId: "c" });
  assert.deepEqual(
    underParents([a, b, c, d, e]).map((r) => `${r.depth}${r.ticket.id}`),
    ["0a", "1c", "2e", "0b", "0d"],
  );
});

test("the list line leads with the short id when there is one", () => {
  assert.match(ticketLine(ticket({ shortId: "SPX-7" })), /^SPX-7\s+cmvaaaa/);
  assert.match(ticketLine(ticket()), /^cmvaaaa/);
});

test("a short id resolves with one read of that ticket, never the whole board", async () => {
  answer = (url) =>
    url.endsWith("/tickets/SPX-2")
      ? { status: 200, body: { ok: true, ticket: ticket({ id: "cmvbbbbbbbbbbbbbbbbbbbbbb", shortId: "SPX-2" }) } }
      : { status: 500, body: { error: "the list must not be asked" } };
  assert.equal(await boardResolveId("spx-2"), "cmvbbbbbbbbbbbbbbbbbbbbbb");
  assert.deepEqual(calls.map((c) => c.url), ["https://board.test/api/v1/projects/spx-stats/tickets/SPX-2"]);
  assert.equal((await boardGet("cmvbbbbbbbbbbbbbbbbbbbbbb"))?.shortId, "SPX-2");
  assert.equal(calls.length, 1, "claim reads the ticket it just resolved without asking again");
  assert.equal(await boardResolveId("cmvcccccccccccccccccccccc"), "cmvcccccccccccccccccccccc");
  assert.equal(calls.length, 1, "a cuid never asks the board");
});

test("a short id nobody has is returned as typed, after the list is checked", async () => {
  answer = (url) => (url.endsWith("/tickets") ? { status: 200, body: { tickets: [ticket({ shortId: "SPX-1" })] } } : { status: 404, body: { ok: false, error: "missing" } });
  assert.equal(await boardResolveId("SPX-9"), "SPX-9");
});

test("an older Sumilabu without short ids says so", async () => {
  answer = (url) => (url.endsWith("/tickets") ? { status: 200, body: { tickets: [ticket()] } } : { status: 404, body: { ok: false, error: "missing" } });
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

const empty = { status: 404, body: { ok: false, error: "missing" } };

test("notes: read oldest first, a missing ticket, and a Sumilabu without them", async () => {
  answer = () => ({ status: 200, body: { ok: true, notes: [{ id: "n1", ticketId: "t", body: "First", by: "m", createdAt: "2026-11-08T00:00:00.000Z" }] } });
  assert.equal(((await boardNotes("SPX-1")) as unknown[]).length, 1);
  assert.equal(calls[0].url, "https://board.test/api/v1/projects/spx-stats/tickets/SPX-1/notes");
  answer = () => empty;
  assert.equal(await boardNotes("x"), "missing");
  answer = () => ({ status: 404, body: "<html>Not found</html>" });
  assert.equal(await boardNotes("x"), null);
});

test("a note is posted with its actor, on any ticket, and refusals are said in words", async () => {
  answer = () => ({ status: 201, body: { ok: true, note: { id: "n1", ticketId: "t", body: "Hello", by: "machine2", createdAt: "2026-11-08T00:00:00.000Z" } } });
  const out = await boardAddNote("cmvaaaaaaaaaaaaaaaaaaaaaa", "Hello", "machine2");
  assert.ok(out.ok && out.note.body === "Hello");
  assert.deepEqual(calls[0].body, { body: "Hello" });
  assert.equal(calls[0].method, "POST");
  assert.match(calls[0].url, /\/tickets\/cmvaaaaaaaaaaaaaaaaaaaaaa\/notes$/);
  answer = () => ({ status: 422, body: { ok: false, error: "too long", problems: ["too long"] } });
  const capped = await boardAddNote("x", "Hello", "m");
  assert.deepEqual(!capped.ok && capped.reason === "invalid" && capped.problems, ["too long"]);
  answer = () => empty;
  const gone = await boardAddNote("x", "Hello", "m");
  assert.ok(!gone.ok && gone.reason === "missing");
  answer = () => ({ status: 404, body: "<html>Not found</html>" });
  const old = await boardAddNote("x", "Hello", "m");
  assert.ok(!old.ok && old.reason === "unsupported");
});

test("a parent is set and cleared with PATCH parentId", async () => {
  answer = () => ({ status: 200, body: { ok: true, ticket: ticket({ parentId: "cmvbbbbbbbbbbbbbbbbbbbbbb" }) } });
  assert.equal((await boardSetParent("x", "SPX-2", "machine2")).ok, true);
  assert.deepEqual(calls[0].body, { parentId: "SPX-2" });
  assert.equal(calls[0].method, "PATCH");
  answer = () => ({ status: 200, body: { ok: true, ticket: ticket({ parentId: null }) } });
  assert.equal((await boardSetParent("x", null, "machine2")).ok, true);
  assert.deepEqual(calls[1].body, { parentId: null });
});

test("a parent refused is said in words; a Sumilabu that ignores the field is unsupported", async () => {
  answer = () => ({ status: 422, body: { ok: false, error: "loop", problems: ["A ticket cannot sit under itself."] } });
  const loop = await boardSetParent("x", "x", "m");
  assert.deepEqual(!loop.ok && loop.reason === "invalid" && loop.problems, ["A ticket cannot sit under itself."]);
  answer = () => ({ status: 409, body: { ok: false, error: "done" } });
  const done = await boardSetParent("x", "SPX-2", "m");
  assert.ok(!done.ok && done.reason === "done");
  answer = () => ({ status: 200, body: { ok: true, ticket: ticket() } });
  const old = await boardSetParent("x", "SPX-2", "m");
  assert.ok(!old.ok && old.reason === "unsupported");
});

test("related: 201 is new, 200 was already linked; delete says whether it was there", async () => {
  answer = () => ({ status: 201, body: { ok: true, created: true, related: ["SPX-2"] } });
  const added = await boardRelate("SPX-1", "SPX-2", "machine2");
  assert.ok(added.ok && added.changed && added.related[0] === "SPX-2");
  assert.deepEqual(calls[0].body, { otherId: "SPX-2" });
  assert.match(calls[0].url, /\/tickets\/SPX-1\/links$/);
  answer = () => ({ status: 200, body: { ok: true, created: false, related: ["SPX-2"] } });
  const again = await boardRelate("SPX-1", "SPX-2", "machine2");
  assert.ok(again.ok && !again.changed);
  answer = () => ({ status: 200, body: { ok: true, removed: true, related: [] } });
  const removed = await boardRelate("SPX-1", "SPX-2", "machine2", true);
  assert.ok(removed.ok && removed.changed);
  assert.equal(calls[2].method, "DELETE");
  assert.match(calls[2].url, /\/tickets\/SPX-1\/links\/SPX-2$/);
  answer = () => ({ status: 200, body: { ok: true, removed: false, related: [] } });
  const gone = await boardRelate("SPX-1", "SPX-2", "machine2", true);
  assert.ok(gone.ok && !gone.changed);
  answer = () => ({ status: 422, body: { ok: false, error: "itself", problems: ["A ticket cannot be related to itself."] } });
  assert.ok(!(await boardRelate("SPX-1", "SPX-1", "m")).ok);
});
