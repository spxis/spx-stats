import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { boardKey, fileKey } from "./boardKey.ts";
import { realToken } from "./ticketStatus.ts";

/** Run in web/: pnpm test:boardkey. A stand-in folder and made-up keys only; no real key is read or printed. */

const dir = mkdtempSync(join(tmpdir(), "boardkey-"));
const FAKE = "fake-key-for-tests-0000000000000000000000000000000000000000000000";
writeFileSync(join(dir, "alpha"), `${FAKE}\n`);
writeFileSync(join(dir, "beta"), `\n  ${FAKE}-beta  \r\nsecond line\n`);
writeFileSync(join(dir, "empty"), "\n\n");
mkdirSync(join(dir, "adir"));
after(() => rmSync(dir, { recursive: true, force: true }));

const noKeychain = () => null;

test("a key file is read, trimmed, first non-blank line", () => {
  assert.equal(fileKey("alpha", dir), FAKE);
  assert.equal(fileKey("beta", dir), `${FAKE}-beta`);
});

test("missing, empty, unreadable and unsafe names give null", () => {
  assert.equal(fileKey("nope", dir), null);
  assert.equal(fileKey("empty", dir), null);
  assert.equal(fileKey("adir", dir), null);
  assert.equal(fileKey("../alpha", dir), null);
  assert.equal(fileKey("a/b", dir), null);
  assert.equal(fileKey("", dir), null);
});

test("order: environment, then keychain, then the file", () => {
  assert.equal(boardKey("alpha", { env: " from-env ", keychain: () => "from-keychain", keyDir: dir }), "from-env");
  assert.equal(boardKey("alpha", { env: "  ", keychain: () => "from-keychain", keyDir: dir }), "from-keychain");
  assert.equal(boardKey("alpha", { keychain: noKeychain, keyDir: dir }), FAKE);
  assert.equal(boardKey("nope", { keychain: noKeychain, keyDir: dir }), null);
});

test("pnpm task status reads the folder named by SUMILABU_BOARD_KEY_DIR", () => {
  const was = { dir: process.env.SUMILABU_BOARD_KEY_DIR, env: process.env.SUMILABU_BOARD_TOKEN_ALPHA };
  process.env.SUMILABU_BOARD_KEY_DIR = dir;
  delete process.env.SUMILABU_BOARD_TOKEN_ALPHA;
  try {
    assert.equal(realToken("alpha"), FAKE);
    process.env.SUMILABU_BOARD_TOKEN_ALPHA = "env-wins";
    assert.equal(realToken("alpha"), "env-wins");
  } finally {
    if (was.dir === undefined) delete process.env.SUMILABU_BOARD_KEY_DIR;
    else process.env.SUMILABU_BOARD_KEY_DIR = was.dir;
    if (was.env === undefined) delete process.env.SUMILABU_BOARD_TOKEN_ALPHA;
    else process.env.SUMILABU_BOARD_TOKEN_ALPHA = was.env;
  }
});

test("pnpm task --board <key> sends the file's key and never prints it", async () => {
  let seen = "";
  const server = createServer((req, res) => {
    seen = String(req.headers.authorization ?? "");
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ tickets: [] }));
  });
  await new Promise<void>((ok) => server.listen(7720, "127.0.0.1", ok));
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, SUMILABU_BOARD_KEY_DIR: dir, SUMILABU_BOARD_URL: "http://127.0.0.1:7720" };
    delete env.SUMILABU_BOARD_TOKEN;
    delete env.SUMILABU_BOARD_PROJECT;
    const child = spawn(process.execPath, ["scripts/task.ts", "--board", "alpha"], { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const code: number = await new Promise((ok) => child.on("close", (c) => ok(c ?? 1)));
    assert.equal(code, 0, out);
    assert.equal(seen, `Bearer ${FAKE}`);
    assert.ok(!out.includes(FAKE), "the key must never be printed");
  } finally {
    server.close();
  }
});
