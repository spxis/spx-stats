import assert from "node:assert/strict";
import { test } from "node:test";
import { isTransient, mayFallBack, shouldThrow } from "../src/lib/api/failure.ts";

/** Run in web/: pnpm test:failure */
test("a 5xx answer or a read that threw (timeout, network) is transient; a 4xx or a bad row is not", () => {
  assert.equal(isTransient(500, false), true);
  assert.equal(isTransient(503, false), true);
  assert.equal(isTransient(undefined, true), true);
  assert.equal(isTransient(400, false), false);
  assert.equal(isTransient(404, false), false);
  assert.equal(isTransient(416, false), false);
  assert.equal(isTransient(undefined, false), false, "a schema or shape error has no status and did not throw");
});

test("in production a transient failure throws so a regeneration keeps the last good page", () => {
  assert.equal(shouldThrow({ transient: true }, "production"), true);
});

test("every other failure keeps the inline note, and so does anything outside production", () => {
  assert.equal(shouldThrow({ transient: false }, "production"), false);
  assert.equal(shouldThrow({}, "production"), false);
  assert.equal(shouldThrow({ transient: true }, "development"), false);
  assert.equal(shouldThrow({ transient: true }, "test"), false);
  assert.equal(shouldThrow({ transient: true }, undefined), false);
});

test("an extra section falls back to its empty answer only for a failed read that is not transient in production", () => {
  assert.equal(mayFallBack(true, { transient: true }, "production"), false, "transient in production: throw so the last good page is kept");
  assert.equal(mayFallBack(true, { transient: false }, "production"), true);
  assert.equal(mayFallBack(true, { transient: true }, "development"), true);
  assert.equal(mayFallBack(false, { transient: false }, "development"), false, "anything that is not a failed read is rethrown");
  assert.equal(mayFallBack(false, {}, "production"), false);
});
