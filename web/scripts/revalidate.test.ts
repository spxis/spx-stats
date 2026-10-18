import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { REVALIDATE, REVALIDATE_DAY, REVALIDATE_HISTORICAL } from "../src/lib/api/config.ts";
import { tagsFor } from "../src/lib/api/tags.ts";
import { MAX_TAGS, bearer, parseTags, secretMatches } from "../src/lib/revalidate.ts";
import { plainMarks } from "../src/lib/localTime.ts";
import { barMessages, parseTab, requestBlock } from "../src/lib/releases/rules.ts";

/** Run in web/: pnpm test:revalidate */
const SECRET = "a".repeat(40);

test("the Bearer token is read from the Authorization header only", () => {
  assert.equal(bearer(`Bearer ${SECRET}`), SECRET);
  for (const bad of [null, undefined, "", SECRET, `bearer ${SECRET}`, "Bearer ", "Bearer a b", `Basic ${SECRET}`]) assert.equal(bearer(bad), "", String(bad));
});

test("a wrong, empty or missing secret is rejected; a configured secret under 32 characters never matches", () => {
  assert.equal(secretMatches(SECRET, SECRET), true);
  assert.equal(secretMatches(SECRET, `  ${SECRET}\n`), true);
  assert.equal(secretMatches("b".repeat(40), SECRET), false);
  assert.equal(secretMatches(SECRET.slice(0, -1), SECRET), false);
  assert.equal(secretMatches(`${SECRET}x`, SECRET), false);
  assert.equal(secretMatches("", SECRET), false);
  assert.equal(secretMatches(SECRET, undefined), false);
  assert.equal(secretMatches(SECRET, ""), false);
  assert.equal(secretMatches("short", "short"), false);
});

test("only a short list of plain tags is accepted", () => {
  assert.deepEqual(parseTags({ tags: ["api:games:nhl", "api:games:all", "data-version", "api:games:nhl"] }), ["api:games:nhl", "api:games:all", "data-version"]);
  const bad: unknown[] = [null, "x", [], {}, { tags: [] }, { tags: "api" }, { tags: [1] }, { tags: ["API"] }, { tags: ["a b"] }, { tags: ["a/b"] }, { tags: ["x".repeat(101)] },
    { tags: Array.from({ length: MAX_TAGS + 1 }, (_, i) => `t${i}`) }];
  for (const b of bad) assert.equal(parseTags(b), null, JSON.stringify(b)?.slice(0, 40));
  assert.equal(parseTags({ tags: Array.from({ length: MAX_TAGS }, (_, i) => `t${i}`) })?.length, MAX_TAGS);
});

test("every fetch is tagged with the api, its view and its league (or all)", () => {
  assert.deepEqual(tagsFor("games", "league=eq.nhl&year=eq.2012&select=*"), ["api", "api:games", "api:games:nhl"]);
  assert.deepEqual(tagsFor("games", "select=*&league=eq.NBA"), ["api", "api:games", "api:games:nba"]);
  assert.deepEqual(tagsFor("totals", "select=*"), ["api", "api:totals", "api:totals:all"]);
  assert.deepEqual(tagsFor("awards", "league=neq.nhl&select=*"), ["api", "api:awards", "api:awards:all"]);
  assert.deepEqual(tagsFor("games", "league=in.(nhl,nba)"), ["api", "api:games", "api:games:all"]);
});

test("the tab comes from the address, then from the remembered one, then Pending", () => {
  assert.equal(parseTab("history", "settings"), "history");
  assert.equal(parseTab(undefined, "settings"), "settings");
  assert.equal(parseTab("nope", "drift"), "drift");
  assert.equal(parseTab(["drift", "history"], null), "drift");
  assert.equal(parseTab(undefined, "nope"), "pending");
  assert.equal(parseTab(undefined, undefined), "pending");
});

test("a scores update request waits for the open one, then for the cooldown", () => {
  const now = Date.parse("2026-10-12T12:00:00Z");
  const done = (min: number) => ({ id: 3, status: "done", requested_at: new Date(now - (min + 1) * 60_000).toISOString(), finished_at: new Date(now - min * 60_000).toISOString() });
  assert.equal(requestBlock([], now), null);
  assert.match(requestBlock([{ id: 4, status: "queued", requested_at: new Date(now).toISOString(), finished_at: null }, done(30)], now) ?? "", /#4 is queued/);
  assert.match(requestBlock([{ id: 4, status: "running", requested_at: new Date(now).toISOString(), finished_at: null }], now) ?? "", /running/);
  assert.match(plainMarks(requestBlock([done(3)], now) ?? ""), /ask again at 12:07 UTC/);
  assert.equal(requestBlock([done(11)], now), null);
});

test("the admin bar says nothing unless something needs the admin", () => {
  assert.deepEqual(barMessages(null), []);
  assert.deepEqual(barMessages({ waiting: 0, drift: 0, paused: false }), []);
  assert.deepEqual(barMessages({ waiting: 1, drift: 0, paused: false }), ["1 release is waiting for approval"]);
  assert.deepEqual(barMessages({ waiting: 3, drift: 1, paused: true }), ["3 releases are waiting for approval", "a drift fix is proposed", "auto-approval is on Hold"]);
});

/* ---------- how long a kept page lives ---------------------------------------------------- */

const SRC = new URL("../src/", import.meta.url);
const sourceFiles = (readdirSync(SRC, { recursive: true }) as string[])
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => ({ f, text: readFileSync(new URL(f, SRC), "utf8") }));

test("kept pages live a day (live) or 30 days (historical); only the signed-in pages are drawn per request (0)", () => {
  const seen: string[] = [];
  const allowed = new Set([String(REVALIDATE_DAY), String(REVALIDATE_HISTORICAL)]);
  for (const { f, text } of sourceFiles) {
    for (const m of text.matchAll(/export const revalidate = (\S+?);/g)) {
      seen.push(f);
      if (f.startsWith("app/(dyn)/")) assert.equal(m[1], "0", `${f}: a signed-in page is drawn per request`);
      // Static files that read no database (flags, drawings) may live longer than a day, never shorter.
      else if (f.startsWith("app/flag/")) assert.ok(/^\d+$/.test(m[1] ?? "") && Number(m[1]) >= REVALIDATE_DAY, `${f}: flag route must live at least a day`);
      else assert.ok(allowed.has(m[1] ?? ""), `${f}: segment config revalidate must be ${REVALIDATE_DAY} or ${REVALIDATE_HISTORICAL}, not ${m[1]}`);
    }
    assert.doesNotMatch(text, /revalidate:\s*3600\b/, `${f}: a one-hour read time`);
    assert.doesNotMatch(text, /revalidate\s*=\s*3600\b/, `${f}: a one-hour page time`);
  }
  assert.ok(seen.length > 20, "found the kept pages");
  assert.ok(seen.includes("app/[locale]/layout.tsx"));
  assert.match(readFileSync(new URL("app/[locale]/layout.tsx", SRC), "utf8"), /export const revalidate = 2592000;/);
  assert.match(readFileSync(new URL("app/[locale]/s/page.tsx", SRC), "utf8"), /export const revalidate = 86400;/);
  assert.match(readFileSync(new URL("app/[locale]/s/[league]/[year]/game/[game]/page.tsx", SRC), "utf8"), /export const revalidate = 2592000;/);
  assert.equal(REVALIDATE, REVALIDATE_HISTORICAL);
  assert.equal(REVALIDATE_DAY, 86400);
  assert.equal(REVALIDATE_HISTORICAL, 2592000);
});

test("every server fetch of the archive carries cache tags the release runner can revalidate", () => {
  const client = readFileSync(new URL("lib/api/client.ts", SRC), "utf8");
  const releases = readFileSync(new URL("lib/releases/client.ts", SRC), "utf8");
  assert.match(client, /next: \{ revalidate: [^}]*tags: tagsFor\(view, query\) \}/);
  assert.match(releases, /next: \{ revalidate: [^}]*tags: \["data-version"\] \}/);
  // The only other read of the archive is the signed-in admin's, which is never kept (no-store) or is the 60 second tagged summary.
  assert.equal([...client.matchAll(/\bfetch\(/g)].length, 1);
  assert.equal([...releases.matchAll(/\bfetch\(/g)].length, 2);
  // No other module in the site reaches the archive.
  for (const { f, text } of sourceFiles) {
    // adminPeople.ts is the admin's own list, read per request with no-store.
    if (f === "lib/api/client.ts" || f === "lib/releases/client.ts" || f === "lib/api/config.ts" || f === "lib/adminPeople.ts") continue;
    assert.doesNotMatch(text, /\bREST_URL\b/, `${f}: reads the archive without cache tags`);
  }
});
