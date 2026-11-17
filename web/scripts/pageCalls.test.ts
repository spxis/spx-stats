import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * Server calls caused by ONE page view. Every request that passes the proxy matcher (src/proxy.ts) is a function run on Vercel: 1M a month, 4 h of CPU, shared by
 * every project. A page view is more than its document: the router prefetches linked pages, a table asks for its rows, a flag is a file. This opens one page of
 * each main kind in a real browser, scrolls to the bottom, and counts what reached the server and would run the proxy.
 *
 * Run in web/ against a built site (`pnpm build && pnpm start`, with SPX_REST_URL set to the read-only preview and SPX_AUTH_CONFIGURED=1 so the header is the
 * production header), on a port of this project's block:
 *   PAGES_URL=http://localhost:7715 pnpm test:pagecalls
 * Skipped, with the reason, when PAGES_URL is not set or there is no Chromium for playwright-core. Never point it at production.
 *
 * Measured 2026-10-30 (signed-in hint, so /api/me is included). The first column is the budget; the next two are what the page did before and after the change that
 * made the header menu fetch on intent, left the country flags and brand files out of the matcher and stopped the 404 mascot being preloaded on every page.
 *   kind          budget  before  after     (requests through the proxy: load, then scroll to the bottom)
 *   home               3      25      2
 *   league             4      31      2   (4 since "Today in history": the block asks for its day's small kept answer, /<league>/rows/today/MM-DD, one run per view; the document, /api/me and the champion's logo are the others)
 *   season             6      33      5
 *   team season        5      44      4
 *   franchise         22      60     20   (12 of them are jersey and title banners, still behind the gate: a decision for John)
 *   game               3      30      2
 *   player             8      37      6
 *   players            6      40      4   (hosted club logos, /team-logos/, stay behind the gate)
 *   teams              9      30      7   (the same: a first-draw logo is 404 on a Mac without the exported files)
 *   cities             4      28      2
 * A page that goes over its budget has added a request per page view: look at what it fetches (the list in the failure message) before raising the number.
 *
 * The closed site (lib/invite): a signed-out browser is drawn the kept invite page, whatever address it asks for, so a crowd of them costs proxy runs and no render.
 * Checked against a second server of the same build started with SITE_ACCESS=invite (the last test; skipped without CLOSED_URL):
 *   CLOSED_URL=http://localhost:7716 pnpm test:pagecalls
 *   invite page        2       -      1   (the document; before, each view was also a render of /invite-only)
 */
const BASE = process.env.PAGES_URL;
const MATCHER = (() => {
  const found = /matcher:\s*\[\s*"([^"]+)"/.exec(readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8"));
  assert.ok(found, "the matcher in src/proxy.ts is one literal string");
  return new RegExp(`^${found[1].replace(/\\\\/g, "\\")}$`);
})();

type Kind = { kind: string; path: string; budget: number };
const KINDS: Kind[] = [
  { kind: "home", path: "/", budget: 3 },
  { kind: "league", path: "/nhl", budget: 4 },
  { kind: "season", path: "/mlb/2024", budget: 6 },
  { kind: "team season", path: "/mlb/2007/team/cincinnati-reds", budget: 5 },
  { kind: "franchise", path: "/mlb/team/cincinnati-reds", budget: 22 },
  { kind: "game", path: "/mlb/2026/game/4887974-milwaukee-brewers-at-tampa-bay-rays", budget: 3 },
  { kind: "player", path: "/nhl/player/wayne-gretzky-1866", budget: 8 },
  { kind: "players list", path: "/players", budget: 6 },
  { kind: "teams list", path: "/teams", budget: 9 },
  { kind: "cities list", path: "/cities", budget: 4 },
];

async function browserOrReason() {
  if (!BASE) return { reason: "set PAGES_URL to a running site (pnpm build && pnpm start) to count a page view's requests" };
  try {
    const res = await fetch(`${BASE}/`, { method: "HEAD", signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { reason: `${BASE} answered ${res.status}` };
  } catch {
    return { reason: `nothing is listening at ${BASE}` };
  }
  try {
    const { chromium } = await import("playwright-core");
    return { browser: await chromium.launch() };
  } catch (e) {
    return { reason: `no Chromium for playwright-core: ${(e as Error).message.split("\n")[0]}` };
  }
}

for (const { kind, path, budget } of KINDS) {
  test(`${kind} (${path}): at most ${budget} requests through the proxy for one view, none of them a prefetch`, async (t) => {
    const got = await browserOrReason();
    if (!got.browser) return t.skip(got.reason);
    const { browser } = got;
    try {
      const origin = new URL(BASE!).origin;
      // The worst reader: signed in (the hint cookie makes the page ask /api/me), so the count includes it.
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await ctx.addCookies([{ name: "spxn-in", value: "1", url: BASE! }]);
      await ctx.addInitScript(() => { try { localStorage.setItem("spxn-probed", "1"); } catch { /* storage may be blocked */ } });
      const page = await ctx.newPage();
      const seen: { phase: string; path: string; rsc: boolean }[] = [];
      let phase = "load";
      page.on("request", (req) => {
        const url = new URL(req.url());
        if (url.origin !== origin) return;
        seen.push({ phase, path: url.pathname + (url.search.includes("_rsc=") ? "?_rsc" : ""), rsc: url.searchParams.has("_rsc") });
      });
      await page.goto(`${BASE}${path}`, { waitUntil: "load" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(1500);

      phase = "scroll";
      for (let i = 0; i < 60; i++) {
        const done = await page.evaluate(() => { window.scrollBy(0, 700); return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2; });
        await page.waitForTimeout(120);
        if (done) break;
      }
      await page.waitForTimeout(1200);
      await page.waitForLoadState("networkidle").catch(() => {});

      const through = seen.filter((r) => MATCHER.test(r.path.replace("?_rsc", "")));
      const list = through.map((r) => `${r.phase} ${r.path}`).join("\n  ");
      assert.equal(seen.filter((r) => r.rsc).length, 0, `a page view must not prefetch or navigate on its own (a Link with prefetch on is two requests, 25 to 150 KB each, per link):\n  ${seen.filter((r) => r.rsc).map((r) => r.path).join("\n  ")}`);
      assert.ok(through.length <= budget, `${kind} made ${through.length} requests through the proxy against a budget of ${budget}:\n  ${list}`);

      // Links in the page's body fetch nothing when pointed at; a header link fetches its page, in two requests, only after the pointer rests on it.
      phase = "hover-body";
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      let hovered = 0;
      for (const a of await page.$$("main a[href^='/']")) {
        if (hovered >= 3) break;
        try { if (!(await a.isVisible())) continue; await a.hover({ timeout: 1000 }); hovered++; await page.waitForTimeout(350); } catch { /* not hoverable: next */ }
      }
      await page.waitForTimeout(600);
      assert.equal(seen.filter((r) => r.phase === "hover-body").length, 0, `pointing at ${hovered} links in the body fetched: ${seen.filter((r) => r.phase === "hover-body").map((r) => r.path).join(", ")}`);

      phase = "hover-menu";
      const menu = await page.$("header .aux a[href='/about']");
      if (menu) {
        await menu.hover();
        await page.waitForTimeout(900);
        const fetched = seen.filter((r) => r.phase === "hover-menu");
        assert.ok(fetched.length >= 1 && fetched.length <= 2, `a header link fetches its page in at most two requests once the pointer rests on it, got ${fetched.length}: ${fetched.map((r) => r.path).join(", ")}`);
      }
      await ctx.close();
    } finally {
      await browser.close();
    }
  });
}

const CLOSED = process.env.CLOSED_URL;
test("closed site: a signed-out view of any address is the kept invite page (a cache HIT, no render), in at most 2 requests through the proxy", async (t) => {
  if (!CLOSED) return t.skip("set CLOSED_URL to the built site started with SITE_ACCESS=invite");
  let browser;
  try {
    browser = await (await import("playwright-core")).chromium.launch();
  } catch (e) {
    return t.skip(`no Chromium for playwright-core: ${(e as Error).message.split("\n")[0]}`);
  }
  try {
    const origin = new URL(CLOSED).origin;
    for (const [path, cookie, lang] of [["/nhl/2012-13?view=wildcard", "", "en"], ["/players", "fr", "fr"], ["/no-such-page", "ja", "ja"]] as const) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      if (cookie) await ctx.addCookies([{ name: "spxn-locale", value: cookie, url: CLOSED }]);
      const page = await ctx.newPage();
      const through: string[] = [];
      page.on("request", (req) => {
        const url = new URL(req.url());
        if (url.origin === origin && MATCHER.test(url.pathname)) through.push(url.pathname);
      });
      const res = await page.goto(`${CLOSED}${path}`, { waitUntil: "load" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(1000);
      assert.equal(res?.status(), 200, path);
      assert.equal(res?.headers()["x-nextjs-cache"], "HIT", `${path}: the invite page was drawn for this request`);
      assert.doesNotMatch(res?.headers()["cache-control"] ?? "", /no-store|private/, `${path}: the CDN may keep it`);
      assert.match(res?.headers()["x-robots-tag"] ?? "", /noindex/, path);
      assert.equal(await page.locator('[data-site-gate="closed"]').count(), 1, `${path}: the gate's marker`);
      assert.equal(await page.locator("html").getAttribute("lang"), lang, path);
      assert.equal(await page.locator("button.signin-btn").count(), 1, `${path}: the sign-in button`);
      assert.ok(through.length <= 2, `${path} made ${through.length} requests through the proxy against a budget of 2:\n  ${through.join("\n  ")}`);
      // Sign-in sends the reader back to the address in the bar, read in the browser.
      let callback = "";
      await page.route("**/api/auth/signin/**", (route) => {
        callback = new URLSearchParams(route.request().postData() ?? "").get("callbackUrl") ?? "";
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url: `${CLOSED}${path}` }) });
      });
      await page.click("button.signin-btn");
      await page.waitForTimeout(1200);
      assert.equal(callback, path, "where sign-in returns to");
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
});
