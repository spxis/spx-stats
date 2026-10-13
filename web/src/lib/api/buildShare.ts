import "server-only";
import { createHash } from "node:crypto";
import { mkdir, open, rm, stat } from "node:fs/promises";
import path from "node:path";

/**
 * One database read per `next build`, not one per static-generation worker.
 *
 * `next build` draws the kept pages in about twenty worker processes. Next's data cache has an in-process lock only, so the workers
 * that all need the same view at the same moment each send the same request before the first answer is on disk (on 2026-10-13 a
 * build sent 330 requests for 180 distinct reads; the busiest view was asked five to sixteen times). Every one of those lands on a
 * small free database.
 *
 * Here the workers queue per read with a lock file under the build's own cache folder. The first one fetches through Next's normal
 * `fetch` (so the answer, its tags and its revalidate time are kept by Next exactly as before) and waits until Next has written the
 * entry; the others then call the same `fetch` and are answered from Next's disk cache without a request. Nothing here keeps an
 * answer of its own, so nothing here can serve a stale one.
 *
 * It does something only while `next build` runs (`NEXT_PHASE` is set by Next to the production-build phase, and is not set by
 * `next start`, a Vercel function or an ISR refresh). At run time `queuedAtBuild` calls the fetch straight away.
 */

/** `SPX_BUILD_QUEUE=off` turns the queue off (to compare request counts, or if it ever misbehaves). */
const BUILDING = () => process.env.NEXT_PHASE === "phase-production-build" && process.env.SPX_BUILD_QUEUE !== "off";
/** A lock file older than this belongs to a build that died; it is taken over. A read takes 8 s at most per try. */
const STALE_MS = 30_000;
/** Longest a worker waits for another's read before it fetches on its own. */
const MAX_WAIT_MS = 45_000;
const POLL_MS = 20;

const LOCK_DIR = () => path.join(process.cwd(), process.env.NEXT_DIST_DIR || ".next", "cache", "spx-read-locks");

/** Reads this process has already been through the queue for: Next answers them from memory, so there is nothing left to wait for. */
const settled = new Set<string>();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const none = async () => {};

/** Takes the lock file for `id`, waiting for whoever holds it. Resolves to the release function; gives up quietly (no lock) on any trouble. */
async function acquire(id: string): Promise<() => Promise<void>> {
  const dir = LOCK_DIR();
  const file = path.join(dir, createHash("sha256").update(id).digest("hex").slice(0, 32));
  const started = Date.now();
  try {
    await mkdir(dir, { recursive: true });
  } catch {
    return none;
  }
  for (;;) {
    try {
      await (await open(file, "wx")).close();
      return async () => {
        await rm(file, { force: true }).catch(none);
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST" || Date.now() - started > MAX_WAIT_MS) return none;
    }
    try {
      if (Date.now() - (await stat(file)).mtimeMs > STALE_MS) await rm(file, { force: true });
    } catch {
      // the holder just released it: try again at once
      continue;
    }
    await sleep(POLL_MS);
  }
}

/**
 * Runs `send` (a call to the data-cached `fetch`) so that, during `next build`, only one worker at a time makes a given read (`id`).
 * `send` must build its request afresh on every call, because it can be called a second time to wait for Next's cache write.
 */
export async function queuedAtBuild(id: string, send: () => Promise<Response>): Promise<Response> {
  if (!BUILDING() || settled.has(id)) return send();
  const release = await acquire(id);
  try {
    const res = await send();
    if (res.status === 200) {
      // Next writes the cache entry after `fetch` has returned and holds its own per-process lock on that entry until the write is
      // done, so asking again blocks until the entry is on disk (and is answered from it, with no request).
      // (The second answer is dropped unread. Its body is cancelled without waiting: a cancel on one half of a split response only
      // settles when the other half is done too.)
      await send().then((again) => void again.body?.cancel().catch(none), none);
      settled.add(id);
    }
    return res;
  } finally {
    await release();
  }
}
