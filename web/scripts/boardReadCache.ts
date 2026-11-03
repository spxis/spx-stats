import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ReadCache, ReadCacheEntry } from "../src/lib/board/client.ts";

/**
 * `pnpm task`'s copy of its last answers, one file per board and per read,
 * so the next read sends `If-None-Match` and an unchanged board answers 304:
 * no body, and on Sumilabu no database query (SUMILABU-15, 2026-11-03).
 *
 * The folder is the home directory's .cache/sumilabu-board (or
 * XDG_CACHE_HOME's, or SUMILABU_BOARD_CACHE_DIR), mode 700, a folder per
 * board, each file mode 600 and named by a hash of the address it answers.
 * What is kept is the address, the ETag and the board's answer: never the
 * board key, which is in no address. SUMILABU_BOARD_CACHE=off turns it off.
 * Nothing here runs on a timer; it is read and written only when a command
 * asks the board.
 */

const SAFE_BOARD = /^[a-z0-9][a-z0-9-]*$/i;

export function cacheFolder(env: Record<string, string | undefined> = process.env): string {
  const own = env.SUMILABU_BOARD_CACHE_DIR?.trim();
  if (own) return own;
  return join(env.XDG_CACHE_HOME?.trim() || join(homedir(), ".cache"), "sumilabu-board");
}

function fileFor(root: string, board: string, url: string): string | null {
  if (!SAFE_BOARD.test(board)) return null;
  return join(root, board, `${createHash("sha256").update(url).digest("hex").slice(0, 32)}.json`);
}

/** A cache on disk, or null when it is turned off. Errors reading or writing it are never fatal: the board is asked as before. */
export function diskReadCache(env: Record<string, string | undefined> = process.env): ReadCache | null {
  if ((env.SUMILABU_BOARD_CACHE ?? "").trim().toLowerCase() === "off") return null;
  const root = cacheFolder(env);
  return {
    get(board, url) {
      const file = fileFor(root, board, url);
      if (!file) return null;
      try {
        const saved = JSON.parse(readFileSync(file, "utf8")) as ReadCacheEntry & { url?: string };
        return saved.url === url && typeof saved.etag === "string" ? { etag: saved.etag, body: saved.body } : null;
      } catch {
        return null;
      }
    },
    put(board, url, entry) {
      const file = fileFor(root, board, url);
      if (!file) return;
      try {
        for (const dir of [root, join(root, board)]) {
          mkdirSync(dir, { recursive: true, mode: 0o700 });
          chmodSync(dir, 0o700);
        }
        const tmp = `${file}.${process.pid}.tmp`;
        writeFileSync(tmp, JSON.stringify({ url, etag: entry.etag, savedAt: new Date().toISOString(), body: entry.body }), { mode: 0o600 });
        chmodSync(tmp, 0o600);
        renameSync(tmp, file);
      } catch {
        /* a read-only or full disk: the answer is still used, just not kept */
      }
    },
  };
}
