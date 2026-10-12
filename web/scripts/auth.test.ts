import assert from "node:assert/strict";
import { test } from "node:test";
import { adminEmails, isAdmin } from "../src/lib/auth/admin.ts";
import { sameOrigin } from "../src/lib/auth/origin.ts";
import { safeDestination } from "../src/lib/auth/redirect.ts";

/** Run in web/: pnpm test:auth */
const env = { ADMIN_EMAILS: "John@Spxis.com, other@example.com", ADMIN_GOOGLE_ALLOWED_EMAILS: "third@example.com" };

test("the admin list reads both variable names, trimmed and lower-cased", () => {
  assert.deepEqual(adminEmails(env), ["john@spxis.com", "other@example.com", "third@example.com"]);
  assert.deepEqual(adminEmails({}), []);
});

test("admin needs a listed address and a verified Google email", () => {
  assert.equal(isAdmin("JOHN@spxis.com", true, env), true);
  assert.equal(isAdmin("john@spxis.com", false, env), false);
  assert.equal(isAdmin("john@spxis.com", undefined, env), false);
  assert.equal(isAdmin("stranger@example.com", true, env), false);
  assert.equal(isAdmin(null, true, env), false);
  assert.equal(isAdmin("john@spxis.com", true, {}), false);
});

test("only same-site paths survive as a sign-in destination", () => {
  assert.equal(safeDestination("/admin/tickets?status=done"), "/admin/tickets?status=done");
  for (const bad of [null, "", "https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "evil", "/a\nb", "/" + "a".repeat(600)]) {
    assert.equal(safeDestination(bad), "/", String(bad));
  }
});

test("a POST is same-origin only when Origin names the host it was sent to", () => {
  const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n] ?? null });
  assert.equal(sameOrigin(headers({ origin: "https://spxn.com", host: "spxn.com" })), true);
  assert.equal(sameOrigin(headers({ origin: "https://spxn.com", host: "internal", "x-forwarded-host": "spxn.com" })), true);
  assert.equal(sameOrigin(headers({ origin: "https://evil.test", host: "spxn.com" })), false);
  assert.equal(sameOrigin(headers({ host: "spxn.com" })), false);
  assert.equal(sameOrigin(headers({ origin: "null", host: "spxn.com" })), false);
});
