import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

/** Run in web/: pnpm test:buildshare (the flag lets the `server-only` import through, as Next's server build does). */
const dir = await mkdtemp(path.join(tmpdir(), "spx-buildshare-"));
process.chdir(dir);
const { queuedAtBuild } = await import("../src/lib/api/buildShare.ts");

/** Stands in for Next's data-cached fetch: the first call per key goes to "the network" and is remembered, later calls are answered from memory. */
function fakeCachedFetch() {
  const kept = new Map<string, Response>();
  const stats = { network: 0 };
  const send = (key: string) => async () => {
    if (!kept.has(key)) {
      stats.network++;
      await new Promise((r) => setTimeout(r, 40));
      kept.set(key, new Response("[]", { status: 200 }));
    }
    return kept.get(key)!.clone();
  };
  return { stats, send };
}

test("during a build, callers asking for the same read at once cause one request", async () => {
  process.env.NEXT_PHASE = "phase-production-build";
  const f = fakeCachedFetch();
  const answers = await Promise.all(Array.from({ length: 12 }, () => queuedAtBuild("view?a=1|0|1000|false", f.send("a"))));
  assert.equal(f.stats.network, 1);
  assert.ok(answers.every((r) => r.status === 200));
});

test("different reads do not wait for each other", async () => {
  process.env.NEXT_PHASE = "phase-production-build";
  const f = fakeCachedFetch();
  await Promise.all(["x", "y", "z"].map((k) => queuedAtBuild(k, f.send(k))));
  assert.equal(f.stats.network, 3);
});

test("at run time (no build phase) the fetch is called straight away, once per caller", async () => {
  delete process.env.NEXT_PHASE;
  let calls = 0;
  const send = async () => (calls++, new Response("[]", { status: 200 }));
  await Promise.all(Array.from({ length: 5 }, () => queuedAtBuild("view", send)));
  assert.equal(calls, 5);
});

test("a failed answer is returned as it is and the lock is released", async () => {
  process.env.NEXT_PHASE = "phase-production-build";
  let calls = 0;
  const send = async () => (calls++, new Response("nope", { status: 404 }));
  const res = await queuedAtBuild("missing", send);
  assert.equal(res.status, 404);
  assert.equal(calls, 1);
  const again = await queuedAtBuild("missing", send);
  assert.equal(again.status, 404);
  assert.deepEqual(await readdir(path.join(dir, ".next", "cache", "spx-read-locks")), []);
});

test("SPX_BUILD_QUEUE=off turns it off", async () => {
  process.env.NEXT_PHASE = "phase-production-build";
  process.env.SPX_BUILD_QUEUE = "off";
  let calls = 0;
  const send = async () => (calls++, new Response("[]", { status: 200 }));
  await Promise.all([queuedAtBuild("off", send), queuedAtBuild("off", send)]);
  assert.equal(calls, 2);
  delete process.env.SPX_BUILD_QUEUE;
});

test.after(async () => {
  process.chdir(tmpdir());
  await rm(dir, { recursive: true, force: true });
});
