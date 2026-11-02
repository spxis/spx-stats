import assert from "node:assert/strict";
import { test } from "node:test";

/**
 * The top of a league's home page (John, 2026-11-02: "the latest champ moves to the bottom of the page, and the stats don't even start until page 2"): heading and buttons, one row with the
 * latest champion beside "Today in history" (equal height; on a phone the champion first), then the seasons, with the other leagues below the stats. Measured in a real browser against a
 * built site, on a port of this project's block:
 *   PAGES_URL=http://localhost:7715 pnpm test:leaguetop        (pnpm build && pnpm start first, SPX_REST_URL at the preview, SPX_AUTH_CONFIGURED=1)
 * Skipped, with the reason, when PAGES_URL is not set or there is no Chromium. The history answer is held back for a second, so the page is measured before and after it arrives.
 */
const BASE = process.env.PAGES_URL;

async function browserOrReason() {
  if (!BASE) return { reason: "set PAGES_URL to a running site (pnpm build && pnpm start) to measure the top of the league pages" };
  try { const res = await fetch(`${BASE}/`, { method: "HEAD", signal: AbortSignal.timeout(5000) }); if (!res.ok) return { reason: `${BASE} answered ${res.status}` }; } catch { return { reason: `nothing is listening at ${BASE}` }; }
  try { const { chromium } = await import("playwright-core"); return { browser: await chromium.launch() }; } catch (e) { return { reason: `no Chromium for playwright-core: ${(e as Error).message.split("\n")[0]}` }; }
}

interface Top { banner: number | null; hist: number | null; row: number | null; seasons: number | null; others: number | null; champions: number | null; label: string | null; histBeside: boolean }
const measure = () => {
  const top = (el: Element | null | undefined) => (el ? Math.round(el.getBoundingClientRect().top + scrollY) : null);
  const height = (el: Element | null) => (el ? Math.round(el.getBoundingClientRect().height) : null);
  const h2 = (re: RegExp) => [...document.querySelectorAll("h2")].find((h) => re.test(h.textContent ?? ""));
  const banner = document.querySelector(".toprow > .banner"), hist = document.querySelector(".toprow > .hist");
  return {
    banner: height(banner), hist: height(hist), row: height(document.querySelector(".toprow")), seasons: top(h2(/^seasons$/i)), others: top(h2(/^other leagues$/i)), champions: top(h2(/^champions$/i)),
    label: document.querySelector(".banner .cup")?.textContent ?? null,
    histBeside: !!banner && !!hist && Math.abs(banner.getBoundingClientRect().top - hist.getBoundingClientRect().top) < 2 && hist.getBoundingClientRect().left > banner.getBoundingClientRect().left,
  };
};

async function look(path: string, width: number, height: number): Promise<{ before: Top; after: Top; hasBlock: boolean } | string> {
  const got = await browserOrReason();
  if (!got.browser) return got.reason;
  try {
    const ctx = await got.browser.newContext({ viewport: { width, height }, timezoneId: "America/Toronto" });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date("2026-11-02T15:00:00Z"));
    await page.route("**/rows/today/**", async (route) => { await new Promise((r) => setTimeout(r, 1000)); await route.continue(); });
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".toprow, h2", { timeout: 15000 });
    await page.waitForTimeout(200);
    const before = (await page.evaluate(measure)) as Top;
    await page.waitForSelector(".hist:not(.hist-wait), .toprow:not(:has(.hist))", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
    const after = (await page.evaluate(measure)) as Top;
    return { before, after, hasBlock: await page.evaluate(() => !!document.querySelector(".hist:not(.hist-wait)")) };
  } finally { await got.browser.close(); }
}

for (const lg of ["nhl", "nba", "mlb", "nfl", "cfl"]) {
  test(`/${lg} at 1280x800: the seasons start on the first screen, the champion and the history are one row of equal height, and nothing jumps when the history arrives`, async (t) => {
    const r = await look(`/${lg}`, 1280, 800);
    if (typeof r === "string") return t.skip(r);
    const { before, after } = r;
    assert.ok(r.hasBlock, "today's block is drawn");
    assert.ok(after.histBeside, "the history sits beside the champion");
    assert.equal(after.banner, after.hist, `equal height: champion ${after.banner}, history ${after.hist}`);
    assert.ok(after.seasons! + 120 < 800, `the Seasons heading is at ${after.seasons}; its first rows must be on the first screen of 800`);
    assert.ok(Math.abs(after.seasons! - before.seasons!) <= 2, `the seasons moved from ${before.seasons} to ${after.seasons} when the history arrived`);
    assert.ok(after.row! <= 230, `the row is ${after.row} px tall`);
    assert.ok(after.seasons! < (after.others ?? after.champions!) && (after.others ?? 0) < after.champions!, "seasons, then other leagues (where there are any), then the champions table");
  });

  test(`/${lg} at 390: the champion first, then the history, and nothing jumps when the history arrives`, async (t) => {
    const r = await look(`/${lg}`, 390, 844);
    if (typeof r === "string") return t.skip(r);
    const { before, after } = r;
    assert.ok(!after.histBeside, "stacked");
    assert.ok(Math.abs(after.seasons! - before.seasons!) <= 6, `the seasons moved from ${before.seasons} to ${after.seasons} when the history arrived`);
  });
}

test("a league with no block: the champion takes the row; an ended league says Final champion, one still playing Latest champion", async (t) => {
  for (const [path, label] of [["/wchl", "Final champion"], ["/nha", "Final champion"], ["/pcha", "Final champion"], ["/wha", "Final champion"], ["/aafc", "Final champion"], ["/nhl", "Latest champion"]] as const) {
    const r = await look(path, 1280, 800);
    if (typeof r === "string") return t.skip(r);
    assert.equal(r.after.label, label, path);
    if (path !== "/nhl") { assert.equal(r.after.hist, null, `${path} has no history block`); assert.ok(!r.hasBlock); }
  }
});
