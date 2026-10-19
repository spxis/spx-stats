import assert from "node:assert/strict";
import { test } from "node:test";
import { encode } from "next-auth/jwt";
import { NextRequest } from "next/server.js";
import { decideGate, type GateRequest } from "../src/lib/invite/gate.ts";
import {
  bypassOk, gateExempt, isBrowserNavigation, isDataPath, isEnvAdmin, normalizeEmail, robotsClosed, siteAccess, siteClosed, validEmail, verdict, type GateSession,
} from "../src/lib/invite/rules.ts";
import { sessionOfRequest } from "../src/lib/invite/session.ts";
import { addInvite, forgetList, invitedEmails, isInvited, removeInvite } from "../src/lib/invite/store.ts";

/** The invite-only gate (ticket "invite-only site"): the rules, the decision for a request, the session read from a cookie and the Turso list. Run in web/: pnpm test:invite */
const CLOSED = { SITE_ACCESS: "invite", ADMIN_EMAILS: "Boss@Example.com", AUTH_SECRET: "test-secret-test-secret-test-secret" };
const hdr = (h: Record<string, string> = {}) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });
const req = (over: Partial<GateRequest> = {}): GateRequest => ({ pathname: "/nhl", search: "", method: "GET", headers: hdr(), env: CLOSED, ...over });
const navigation = hdr({ "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" });
const session = (email: string, over: Partial<GateSession> = {}): GateSession => ({ email, emailVerified: true, invitedClaim: false, ...over });

/** Runs the decision, counting what it read. */
async function decide(r: GateRequest, who: GateSession | null, invited: boolean | null = false) {
  const reads = { session: 0, list: 0 };
  const answer = await decideGate(r, async () => { reads.session++; return who; }, async () => { reads.list++; return invited; });
  return { answer, reads };
}

test("SITE_ACCESS decides, and Vercel is closed unless someone writes open", () => {
  assert.equal(siteAccess({ SITE_ACCESS: "open" }), "open");
  assert.equal(siteAccess({ SITE_ACCESS: " Invite " }), "invite");
  assert.equal(siteAccess({}), "open", "next dev, a local build and the DS1 preview stay open");
  assert.equal(siteAccess({ VERCEL: "1" }), "invite", "a Vercel deployment is closed by default");
  assert.equal(siteAccess({ VERCEL: "1", SITE_ACCESS: "open" }), "open", "one setting reopens it");
  assert.equal(siteAccess({ VERCEL: "1", SITE_ACCESS: "nonsense" }), "invite");
  assert.equal(siteClosed({ VERCEL: "1" }), true);
});

test("signed out: no session, no list read, a browser is drawn the invite page and everything else a few bytes", async () => {
  const page = await decide(req({ headers: navigation, search: "?x=1" }), null);
  assert.deepEqual(page.answer, { action: "rewrite", to: "/invite-only?next=%2Fnhl%3Fx%3D1" });
  assert.equal(page.reads.list, 0, "a signed-out visitor costs no list read");

  const crawler = await decide(req(), null);
  assert.equal(crawler.answer.action, "refuse");
  assert.equal(crawler.answer.action === "refuse" && crawler.answer.status, 401);
  assert.match(crawler.answer.action === "refuse" ? crawler.answer.body : "", /data-site-gate="closed"/);
  assert.doesNotMatch(crawler.answer.action === "refuse" ? crawler.answer.body : "", /<script/);

  for (const pathname of ["/api/players", "/api/teams/suggest", "/nhl/team/montreal-canadiens/rows/standings", "/surface/nfl.en.svg", "/venues.csv", "/soccer-flag/ES.svg", "/sitemap.xml"]) {
    const d = await decide(req({ pathname, headers: navigation }), null);
    assert.equal(d.answer.action, "refuse", pathname);
    assert.equal(d.answer.action === "refuse" && d.answer.status, 401, pathname);
    assert.equal(d.answer.action === "refuse" && d.answer.contentType.startsWith("application/json"), true, pathname);
    assert.doesNotMatch(d.answer.action === "refuse" ? d.answer.body : "", /nhl|canadiens/i, "no data in a refusal");
  }
});

test("invited, admin, not invited, unverified", async () => {
  assert.equal((await decide(req(), session("friend@example.com"), true)).answer.action, "pass", "invited");
  assert.equal((await decide(req({ pathname: "/api/players" }), session("Friend@Example.com"), true)).answer.action, "pass", "invited, data route");
  const admin = await decide(req(), session("boss@example.com"), false);
  assert.equal(admin.answer.action, "pass", "an admin needs no invite");

  const stranger = await decide(req({ headers: navigation }), session("stranger@example.com"), false);
  assert.equal(stranger.answer.action, "rewrite", "not invited sees the invite page");
  const data = await decide(req({ pathname: "/api/players" }), session("stranger@example.com"), false);
  assert.equal(data.answer.action === "refuse" && data.answer.status, 403, "not invited gets 403 on data");

  const unverified = await decide(req(), session("friend@example.com", { emailVerified: false }), true);
  assert.notEqual(unverified.answer.action, "pass", "an unverified Google address never counts, even on the list");
  const unverifiedAdmin = await decide(req(), session("boss@example.com", { emailVerified: false }), true);
  assert.notEqual(unverifiedAdmin.answer.action, "pass");
});

test("when the list cannot be read, the claim made at sign-in decides: nobody invited is locked out, nobody else comes in", async () => {
  assert.equal((await decide(req(), session("friend@example.com", { invitedClaim: true }), null)).answer.action, "pass");
  assert.notEqual((await decide(req(), session("stranger@example.com"), null)).answer.action, "pass");
  assert.notEqual((await decide(req(), session("friend@example.com", { invitedClaim: true }), false)).answer.action, "pass", "removed from the list: the claim no longer counts");
});

test("what stays reachable while closed", async () => {
  const revalidate = await decide(req({ pathname: "/api/revalidate", method: "POST" }), null);
  assert.equal(revalidate.answer.action, "pass", "the release runner's POST (it checks its own secret)");
  assert.deepEqual([revalidate.reads.session, revalidate.reads.list], [0, 0]);
  for (const pathname of ["/api/auth/session", "/api/auth/callback/google", "/api/auth/providers", "/api/me", "/login", "/invite-only", "/favicon.ico", "/_next/static/chunks/a.js", "/brand/logo.svg", "/mascot/x.png"]) {
    assert.equal((await decide(req({ pathname }), null)).answer.action, "pass", pathname);
  }
  for (const pathname of ["/", "/nhl", "/api/players", "/admin", "/admin/invites", "/me", "/api/revalidates", "/api/authx/session", "/login/x", "/invite-only/x"]) {
    assert.notEqual((await decide(req({ pathname }), null)).answer.action, "pass", pathname);
  }
  assert.equal(gateExempt("/_next/image"), false, "the image optimizer serves logos: it is behind the gate");
});

test("robots.txt says Disallow all, to anyone, with no reads", async () => {
  const d = await decide(req({ pathname: "/robots.txt" }), null);
  assert.deepEqual(d.answer, { action: "robots", body: "User-agent: *\nDisallow: /\n" });
  assert.equal(robotsClosed(), "User-agent: *\nDisallow: /\n");
  assert.deepEqual([d.reads.session, d.reads.list], [0, 0]);
});

test("deploy checks pass with the protection-bypass header, and only with the right secret", async () => {
  const env = { ...CLOSED, VERCEL_AUTOMATION_BYPASS_SECRET: "bypass-secret-123", SITE_GATE_BYPASS: "own-secret-456" };
  assert.equal(bypassOk(hdr({ "x-vercel-protection-bypass": "bypass-secret-123" }), env), true);
  assert.equal(bypassOk(hdr({ "x-spxn-gate-bypass": "own-secret-456" }), env), true);
  assert.equal(bypassOk(hdr({ "x-vercel-protection-bypass": "wrong" }), env), false);
  assert.equal(bypassOk(hdr({ "x-vercel-protection-bypass": "own-secret-456x" }), env), false);
  assert.equal(bypassOk(hdr({ "x-vercel-protection-bypass": "" }), { ...env, VERCEL_AUTOMATION_BYPASS_SECRET: "" }), false, "an empty secret never matches an empty header");
  assert.equal(bypassOk(hdr(), env), false);
  const through = await decide(req({ env, headers: hdr({ "x-vercel-protection-bypass": "bypass-secret-123" }) }), null);
  assert.equal(through.answer.action, "pass");
  const refused = await decide(req({ env, headers: hdr({ "x-vercel-protection-bypass": "nope" }) }), null);
  assert.notEqual(refused.answer.action, "pass");
});

test("page versus data, and browser versus not", () => {
  assert.equal(isDataPath("/api/players"), true);
  assert.equal(isDataPath("/nhl/team/x/rows/standings"), true);
  assert.equal(isDataPath("/bracket-svg/nba-2023.wide.en.svg"), true);
  assert.equal(isDataPath("/venues.geojson"), true);
  assert.equal(isDataPath("/nhl/2012-13"), false);
  assert.equal(isDataPath("/players"), false);
  assert.equal(isBrowserNavigation(navigation, "GET"), true);
  assert.equal(isBrowserNavigation(navigation, "POST"), false);
  assert.equal(isBrowserNavigation(hdr({ "sec-fetch-dest": "empty", "sec-fetch-mode": "cors" }), "GET"), false);
  assert.equal(isBrowserNavigation(hdr(), "GET"), false);
});

test("addresses are compared in lower case and must look like addresses", () => {
  assert.equal(normalizeEmail("  Friend@Example.COM "), "friend@example.com");
  assert.equal(isEnvAdmin("BOSS@example.com", CLOSED), true);
  assert.equal(isEnvAdmin("friend@example.com", CLOSED), false);
  assert.equal(verdict(null, true, CLOSED), "signed-out");
  for (const ok of ["a@b.co", "first.last+tag@sub.example.org"]) assert.equal(validEmail(ok), true, ok);
  for (const bad of ["", "a", "a@b", "a b@c.com", "a@b.com, c@d.com", "<a@b.com>", `${"x".repeat(200)}@b.com`]) assert.equal(validEmail(bad), false, bad);
});

// ----------------------------------------------------------------------------------------------------- the session, read from the cookie alone

const SECRET = CLOSED.AUTH_SECRET;
async function cookieRequest(claims: Record<string, unknown>, name = "__Secure-next-auth.session-token") {
  const jwt = await encode({ token: claims, secret: SECRET });
  return new NextRequest("https://spxn.com/nhl", { headers: { cookie: `${name}=${jwt}` } });
}

test("the session cookie is decoded without a database, and a missing or forged one is nobody", async () => {
  const env = { AUTH_SECRET: SECRET, AUTH_GOOGLE_ID: "a", AUTH_GOOGLE_SECRET: "b" };
  const ok = await sessionOfRequest(await cookieRequest({ email: "friend@example.com", emailVerified: true, invited: true }), env);
  assert.deepEqual(ok, { email: "friend@example.com", emailVerified: true, invitedClaim: true });
  const plain = await sessionOfRequest(await cookieRequest({ email: "friend@example.com" }), env);
  assert.deepEqual(plain, { email: "friend@example.com", emailVerified: false, invitedClaim: false });
  assert.equal(await sessionOfRequest(new NextRequest("https://spxn.com/nhl"), env), null, "no cookie");
  assert.equal(await sessionOfRequest(await cookieRequest({ email: "friend@example.com" }), { ...env, AUTH_SECRET: "another-secret-another-secret-123" }), null, "signed with another secret");
  assert.equal(await sessionOfRequest(await cookieRequest({ email: "friend@example.com" }), {}), null, "no secret on the server");
  const local = await sessionOfRequest(await cookieRequest({ email: "dev@example.com", emailVerified: true }, "next-auth.session-token"), env);
  assert.equal(local?.email, "dev@example.com", "the cookie of a plain http server (next dev, the preview)");
  const preview = await cookieRequest({ email: "dev@example.invalid", emailVerified: true, preview: true });
  assert.equal(await sessionOfRequest(preview, env), null, "a preview session counts nowhere the preview sign-in does not exist");
});

// ----------------------------------------------------------------------------------------------------- the list in Turso

type Sent = { sql: string; args: string[] };
function turso(handler: (sent: Sent[], token: string) => { rows?: Record<string, string>[]; error?: string } | number) {
  const calls: { token: string; sent: Sent[] }[] = [];
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { requests: { type: string; stmt?: { sql: string; args: { value: string }[] } }[] };
    const sent = body.requests.filter((r) => r.type === "execute").map((r) => ({ sql: r.stmt!.sql, args: r.stmt!.args.map((a) => a.value) }));
    const token = String((init.headers as Record<string, string>).authorization ?? "").replace("Bearer ", "");
    calls.push({ token, sent });
    const out = handler(sent, token);
    if (typeof out === "number") return new Response("", { status: out });
    const results = sent.map((s) => out.error
      ? { type: "error", error: { message: out.error } }
      : { type: "ok", response: { result: { cols: Object.keys(out.rows?.[0] ?? { n: 0 }).map((name) => ({ name })), rows: /^select/i.test(s.sql) ? (out.rows ?? []).map((r) => Object.values(r).map((value) => ({ type: "text", value }))) : [] } } });
    return new Response(JSON.stringify({ results }), { status: 200 });
  }) as typeof fetch;
  return calls;
}
const withEnv = async (vars: Record<string, string | undefined>, run: () => Promise<void>) => {
  const before = { ...process.env };
  for (const [k, v] of Object.entries(vars)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  forgetList();
  try { await run(); } finally { process.env = before; forgetList(); }
};

test("the invite list is read once a minute per instance, lower-cased, with the read token", async () => {
  await withEnv({ TURSO_DATABASE_URL: "libsql://x.example.test", TURSO_AUTH_TOKEN: "read-token", TURSO_RUNLOG_TOKEN: "write-token" }, async () => {
    const calls = turso(() => ({ rows: [{ email: "Friend@Example.com" }, { email: "b@example.com" }] }));
    assert.equal(await isInvited("FRIEND@example.com"), true);
    assert.equal(await isInvited("nobody@example.com"), false);
    assert.equal(await isInvited("b@example.com"), true);
    assert.equal(calls.length, 1, "one read for three lookups");
    assert.equal(calls[0]!.token, "read-token");
    assert.deepEqual([...(await invitedEmails())].sort(), ["b@example.com", "friend@example.com"]);
  });
});

test("a missing table is an empty list, an outage is null (so the sign-in claim decides) and a removal is seen on this instance at once", async () => {
  await withEnv({ TURSO_DATABASE_URL: "libsql://x.example.test", TURSO_AUTH_TOKEN: "read-token", TURSO_RUNLOG_TOKEN: "write-token" }, async () => {
    turso(() => ({ error: "SQLite error: no such table: invite" }));
    assert.equal(await isInvited("a@example.com"), false);
  });
  await withEnv({ TURSO_DATABASE_URL: "libsql://x.example.test", TURSO_AUTH_TOKEN: "read-token" }, async () => {
    const calls = turso(() => 503);
    assert.equal(await isInvited("a@example.com"), null);
    assert.equal(await isInvited("a@example.com"), null);
    assert.equal(calls.length, 1, "after a failure it waits before asking again");
  });
  await withEnv({ TURSO_DATABASE_URL: undefined, TURSO_AUTH_TOKEN: undefined }, async () => {
    assert.equal(await isInvited("a@example.com"), null, "no Turso here at all");
  });
  await withEnv({ TURSO_DATABASE_URL: "libsql://x.example.test", TURSO_AUTH_TOKEN: "read-token", TURSO_RUNLOG_TOKEN: "write-token" }, async () => {
    let rows = [{ email: "a@example.com" }];
    const calls = turso((sent) => { if (/^delete/i.test(sent.at(-1)!.sql)) rows = []; return { rows }; });
    assert.equal(await isInvited("a@example.com"), true);
    assert.deepEqual(await removeInvite(" A@Example.com "), { ok: true });
    assert.equal(calls.at(-1)!.token, "write-token", "a change uses the write token");
    assert.deepEqual(calls.at(-1)!.sent.at(-1)!.args, ["a@example.com"]);
    assert.equal(await isInvited("a@example.com"), false);
  });
});

test("adding an invite needs the write token and stores the address in lower case", async () => {
  await withEnv({ TURSO_DATABASE_URL: "libsql://x.example.test", TURSO_AUTH_TOKEN: "read-token", TURSO_RUNLOG_TOKEN: undefined }, async () => {
    const calls = turso(() => ({ rows: [{ n: "0" }] }));
    const refused = await addInvite("a@example.com", "boss@example.com", null);
    assert.equal(refused.ok, false);
    assert.equal(calls.length, 0, "nothing was sent");
  });
  await withEnv({ TURSO_DATABASE_URL: "libsql://x.example.test", TURSO_AUTH_TOKEN: "read-token", TURSO_RUNLOG_TOKEN: "write-token" }, async () => {
    const calls = turso(() => ({ rows: [{ n: "3" }] }));
    assert.deepEqual(await addInvite("New@Example.com", "boss@example.com", "a friend"), { ok: true });
    const writes = calls.flatMap((c) => c.sent).filter((s) => /^insert/i.test(s.sql));
    assert.equal(writes.length, 1);
    assert.equal(writes[0]!.args[0], "new@example.com");
    assert.equal(writes[0]!.args[1], "boss@example.com");
    assert.equal(writes[0]!.args[3], "a friend");
  });
});
