import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Where a ticket board's key comes from, in this order: the environment, the
 * keychain item "sumilabu board <key>" (Mac only), then a file named after the
 * board in the key folder (the home directory's .config/sumilabu-board, or the
 * folder SUMILABU_BOARD_KEY_DIR names). A key is returned to the caller and is
 * never printed or logged here.
 */

const SAFE_BOARD = /^[a-z0-9][a-z0-9-]*$/i;

export type KeySources = {
  env?: string | undefined;
  keychain?: (board: string) => string | null;
  keyDir?: string;
  readFile?: (path: string) => string;
};

export function keyFolder(): string {
  return process.env.SUMILABU_BOARD_KEY_DIR?.trim() || join(homedir(), ".config", "sumilabu-board");
}

export function keychainKey(board: string): string | null {
  if (process.platform !== "darwin") return null;
  try {
    return execFileSync("security", ["find-generic-password", "-s", `sumilabu board ${board}`, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

/** The key file's first non-blank line, trimmed; null when the file is missing, unreadable or empty. */
export function fileKey(board: string, dir: string = keyFolder(), readFile: (path: string) => string = (p) => readFileSync(p, "utf8")): string | null {
  if (!SAFE_BOARD.test(board)) return null;
  try {
    return (
      readFile(join(dir, board))
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.length > 0) ?? null
    );
  } catch {
    return null;
  }
}

export function boardKey(board: string, s: KeySources = {}): string | null {
  const env = s.env?.trim();
  if (env) return env;
  return (s.keychain ?? keychainKey)(board) || fileKey(board, s.keyDir, s.readFile);
}
