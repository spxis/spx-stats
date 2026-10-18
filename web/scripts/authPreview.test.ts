import assert from "node:assert/strict";
import { test } from "node:test";
import { isAdmin } from "../src/lib/auth/admin.ts";
import { authProviders } from "../src/lib/auth/providers.ts";
import { authConfigured } from "../src/lib/auth/enabled.ts";
import { DEV_ADMIN, devLogin, devPageAllowed, loopbackRequest, previewAdminEmail, previewMode, previewSignInEnabled, previewUser } from "../src/lib/auth/preview.ts";

/** The preview-only sign-in ("Sign in (this Mac)", lib/auth/preview.ts). Run in web/: pnpm test:auth (it needs --conditions=react-server for config.ts). */
const hdr = (h: Record<string, string>) => ({ get: (n: string) => h[n] ?? null });
const preview = { SPX_PREVIEW: "1", AUTH_SECRET: "s" };
const google = { AUTH_GOOGLE_ID: "a", AUTH_GOOGLE_SECRET: "b", AUTH_SECRET: "c" };
// next-auth merges a provider's `options` over its defaults when it starts, so the id a request sees is options.id when there is one.
const ids = (env: Record<string, string | undefined>) => authProviders(env).map((p) => (p as unknown as { options?: { id?: string } }).options?.id ?? p.id);

test("the preview provider is absent unless SPX_PREVIEW=1 (production, Vercel, a shell with a stray secret)", () => {
  assert.deepEqual(ids({}), []);
  assert.deepEqual(ids(google), ["google"]);
  assert.deepEqual(ids({ AUTH_SECRET: "s" }), []);
  assert.deepEqual(ids({ ...google, SPX_PREVIEW: "0" }), ["google"]);
  assert.deepEqual(ids({ ...google, SPX_PREVIEW: "true" }), ["google"]);
  assert.deepEqual(ids({ ...google, SPX_PREVIEW: "" }), ["google"]);
  assert.equal(previewMode({}), false);
  assert.equal(previewSignInEnabled({ AUTH_SECRET: "s" }), false);
});

test("the preview provider exists only with SPX_PREVIEW=1, a signing secret and no VERCEL", () => {
  assert.deepEqual(ids(preview), ["preview"]);
  assert.deepEqual(ids({ ...preview, ...google }), ["google", "preview"]);
  assert.deepEqual(ids({ SPX_PREVIEW: "1" }), [], "no signing secret, no session");
  assert.deepEqual(ids({ ...preview, VERCEL: "1" }), [], "never on Vercel, whatever else is set");
  assert.equal(authConfigured({ SPX_PREVIEW: "1" }), true);
  assert.equal(authConfigured({ SPX_PREVIEW: "1", VERCEL: "1" }), false);
  assert.equal(authConfigured({ SPX_PREVIEW: "0" }), false);
});

test("a request counts as this Mac only when it names a loopback host and no forwarding header says otherwise", () => {
  for (const host of ["localhost:7700", "127.0.0.1:7702", "localhost", "[::1]:7700", "LOCALHOST:7700"]) assert.equal(loopbackRequest(hdr({ host })), true, host);
  for (const host of ["spxn.com", "192.0.2.5:7700", "localhost.evil.example", "evil.example:7700", "127.0.0.1.evil.example", "localhost@evil.example", ""]) {
    assert.equal(loopbackRequest(hdr({ host })), false, host);
  }
  assert.equal(loopbackRequest(hdr({})), false);
  assert.equal(loopbackRequest(hdr({ host: "localhost:7700", "x-forwarded-host": "spxn.com" })), false);
  assert.equal(loopbackRequest(hdr({ host: "localhost:7700", "x-forwarded-for": "203.0.113.9" })), false);
  assert.equal(loopbackRequest(hdr({ host: "localhost:7700", "x-forwarded-for": "127.0.0.1" })), true);
});

test("the preview signs in as the admin only for a loopback request, and the provider's authorize refuses the rest", async () => {
  assert.equal(previewUser(preview, hdr({ host: "localhost:7700" }))?.email, "john@spxis.com");
  assert.equal(previewUser(preview, hdr({ host: "spxn.com" })), null);
  assert.equal(previewUser({ AUTH_SECRET: "s" }, hdr({ host: "localhost:7700" })), null);
  type Authorize = (credentials: unknown, req: { headers: Record<string, string> }) => unknown;
  const provider = authProviders(preview)[0] as unknown as { options: { authorize: Authorize } };
  assert.equal(((await provider.options.authorize({}, { headers: { host: "localhost:7700" } })) as { email: string }).email, "john@spxis.com");
  assert.equal(await provider.options.authorize({}, { headers: { host: "192.0.2.5:7700" } }), null);
  assert.equal(await provider.options.authorize({}, { headers: { host: "localhost:7700", "x-forwarded-host": "spxn.com" } }), null);
});

test("which address the preview signs in as, and that it counts as an admin only in the preview", () => {
  assert.equal(previewAdminEmail({}), "john@spxis.com");
  assert.equal(previewAdminEmail({ ADMIN_EMAILS: "First@Example.com, second@example.com" }), "first@example.com");
  assert.equal(previewAdminEmail({ ADMIN_EMAILS: "first@example.com", SPX_PREVIEW_ADMIN: "Me@Example.com" }), "me@example.com");
  assert.equal(isAdmin("john@spxis.com", true, preview), true);
  assert.equal(isAdmin("someone@example.com", true, { ...preview, ADMIN_EMAILS: "someone@example.com" }), true, "the first listed address is the preview admin");
  assert.equal(isAdmin("john@spxis.com", true, { AUTH_SECRET: "s" }), false, "outside the preview nobody is an admin without the list");
  assert.equal(isAdmin("john@spxis.com", true, { ...preview, VERCEL: "1" }), false);
});

test("the dev sign-in needs next dev, SPXN_DEV_LOGIN=1 and no VERCEL; a production build has neither the provider nor the /dev page", () => {
  const dev = { NODE_ENV: "development", SPXN_DEV_LOGIN: "1" };
  assert.equal(devLogin(dev), true);
  for (const env of [{}, { SPXN_DEV_LOGIN: "1" }, { NODE_ENV: "development" }, { NODE_ENV: "production", SPXN_DEV_LOGIN: "1" }, { NODE_ENV: "test", SPXN_DEV_LOGIN: "1" }, { ...dev, SPXN_DEV_LOGIN: "true" }, { ...dev, VERCEL: "1" }]) {
    assert.equal(devLogin(env), false, JSON.stringify(env));
    assert.deepEqual(ids(env), []);
    assert.equal(authConfigured(env), false);
    assert.equal(devPageAllowed(env, hdr({ host: "localhost:7702" })), false);
  }
  assert.deepEqual(ids(dev), ["preview"], "no signing secret is needed");
  assert.equal(authConfigured(dev), true);
  assert.equal(previewAdminEmail(dev), DEV_ADMIN);
  assert.equal(isAdmin(DEV_ADMIN, true, dev), true);
  assert.equal(isAdmin(DEV_ADMIN, true, { NODE_ENV: "production", SPXN_DEV_LOGIN: "1", ADMIN_EMAILS: "a@example.com" }), false);
  assert.equal(devPageAllowed(dev, hdr({ host: "localhost:7702" })), true);
  assert.equal(devPageAllowed(dev, hdr({ host: "spxn.com" })), false);
  assert.equal(devPageAllowed(dev, hdr({ host: "localhost:7702", "x-forwarded-host": "spxn.com" })), false);
  assert.equal(previewUser(dev, hdr({ host: "192.0.2.5:7702" })), null);
});
