import assert from "node:assert/strict";
import { test } from "node:test";
import { FR } from "../src/lib/i18n/dictionaries/fr.constants.ts";
import { JA } from "../src/lib/i18n/dictionaries/ja.constants.ts";

/**
 * JavaScript one page view downloads. The HTML is budgeted (pnpm test:weight) and the server calls are budgeted (pnpm test:pagecalls); this is what a phone also
 * has to download, parse and run before the page answers a touch. It opens one page of each main kind in a real browser at phone width, scrolls to the bottom,
 * and adds up every script the page asked for: gzipped bytes on the wire (what the network carries), raw bytes (what the phone parses) and the number of files.
 *
 * Run in web/ against a built site (`pnpm build && pnpm start`, with SPX_REST_URL set to the read-only preview and SPX_AUTH_CONFIGURED=1 so the header is the
 * production header), on a port of this project's block:
 *   PAGES_URL=http://localhost:7715 pnpm test:pagescripts
 * Skipped, with the reason, when PAGES_URL is not set or there is no Chromium for playwright-core. Never point it at production.
 *
 * Measured 2026-10-30 on `next start` (gzip on), a fresh browser with no cache, load and scroll to the bottom. The budget is the measure plus about 6 percent.
 *   kind          gz kB   raw kB   files     (before the change that left the unused languages, next-auth, zod, d3's selection and the large map out:
 *                                              gz kB / raw kB / files)
 *   home            240      747      13     351 / 1117 / 15
 *   league          274      816      18     411 / 1280 / 20
 *   season          391     1125      25     527 / 1590 / 26
 *   team season     379     1111      21     531 / 1610 / 24
 *   franchise       381     1115      21     519 / 1579 / 23
 *   game            237      738      13     364 / 1174 / 14
 *   player          367     1082      21     517 / 1580 / 23
 *   players         339     1004      18     476 / 1466 / 20
 *   teams           337      997      19     490 / 1501 / 22
 *   cities          341     1010      18     480 / 1479 / 20
 * About 70 kB gzipped (a quarter of what is left) is React and Next, 70 kB is the English phrases the client components read, and the world outline (59 kB) is
 * downloaded wherever a small map sits in the page's corner. A page that goes over its budget has added script to every reader: look at the list in the failure
 * message (largest first) for the new file before raising a number, and load what is not needed at first sight with a dynamic import or `useSeen` (AGENTS.md section 9).
 */
const BASE = process.env.PAGES_URL;

type Kind = { kind: string; path: string; gz: number; raw: number; files: number };
const KINDS: Kind[] = [
  { kind: "home", path: "/", gz: 255, raw: 790, files: 15 },
  { kind: "league", path: "/nhl", gz: 290, raw: 865, files: 20 },
  { kind: "season", path: "/mlb/2024", gz: 415, raw: 1195, files: 27 },
  { kind: "team season", path: "/mlb/2007/team/cincinnati-reds", gz: 402, raw: 1180, files: 23 },
  { kind: "franchise", path: "/mlb/team/cincinnati-reds", gz: 405, raw: 1182, files: 23 },
  { kind: "game", path: "/mlb/2026/game/4887974-milwaukee-brewers-at-tampa-bay-rays", gz: 252, raw: 783, files: 15 },
  { kind: "player", path: "/nhl/player/wayne-gretzky-1866", gz: 390, raw: 1148, files: 23 },
  { kind: "players list", path: "/players", gz: 360, raw: 1065, files: 20 },
  { kind: "teams list", path: "/teams", gz: 358, raw: 1058, files: 21 },
  { kind: "cities list", path: "/cities", gz: 362, raw: 1072, files: 20 },
];

type Script = { url: string; raw: number; gz: number; text: string };

async function browserOrReason() {
  if (!BASE) return { reason: "set PAGES_URL to a running site (pnpm build && pnpm start) to count the script of a page view" };
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

/** Opens `path` as a phone with no cache, scrolls to the bottom, and returns every script it fetched. */
async function scriptsOf(browser: import("playwright-core").Browser, path: string, locale?: "fr" | "ja"): Promise<Script[]> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  try {
    await ctx.addCookies([{ name: "spxn-in", value: "1", url: BASE! }, ...(locale ? [{ name: "spxn-locale", value: locale, url: BASE! }] : [])]);
    await ctx.addInitScript(() => { try { localStorage.setItem("spxn-probed", "1"); } catch { /* storage may be blocked */ } });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    const found = new Map<string, { url: string; raw: number; gz: number }>();
    cdp.on("Network.responseReceived", (e) => { if (e.type === "Script") found.set(e.requestId, { url: new URL(e.response.url).pathname, raw: 0, gz: 0 }); });
    cdp.on("Network.dataReceived", (e) => { const s = found.get(e.requestId); if (s) s.raw += e.dataLength; });
    cdp.on("Network.loadingFinished", (e) => { const s = found.get(e.requestId); if (s) s.gz = e.encodedDataLength; });
    await page.goto(`${BASE}${path}`, { waitUntil: "load" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1500);
    for (let i = 0; i < 80; i++) {
      const done = await page.evaluate(() => { window.scrollBy(0, 600); return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2; });
      await page.waitForTimeout(150);
      if (done) break;
    }
    await page.waitForTimeout(1200);
    await page.waitForLoadState("networkidle").catch(() => {});
    const out: Script[] = [];
    for (const s of found.values()) {
      const text = await page.evaluate(async (u) => (await fetch(u)).text(), s.url).catch(() => "");
      out.push({ ...s, text });
    }
    return out;
  } finally {
    await ctx.close();
  }
}

for (const { kind, path, gz, raw, files } of KINDS) {
  test(`${kind} (${path}): at most ${gz} kB gzipped, ${raw} kB raw and ${files} script files for one view`, async (t) => {
    const got = await browserOrReason();
    if (!got.browser) return t.skip(got.reason);
    try {
      const scripts = await scriptsOf(got.browser, path);
      const sum = (k: "raw" | "gz") => scripts.reduce((a, s) => a + s[k], 0) / 1024;
      const list = [...scripts].sort((a, b) => b.gz - a.gz).slice(0, 8).map((s) => `${(s.gz / 1024).toFixed(0).padStart(4)} kB gz ${(s.raw / 1024).toFixed(0).padStart(4)} kB raw  ${s.url}`).join("\n  ");
      const note = `\nthe largest of ${scripts.length} files:\n  ${list}`;
      assert.ok(sum("gz") <= gz, `${kind} downloaded ${sum("gz").toFixed(0)} kB of script (gzipped) against a budget of ${gz}${note}`);
      assert.ok(sum("raw") <= raw, `${kind} downloaded ${sum("raw").toFixed(0)} kB of script (raw) against a budget of ${raw}${note}`);
      assert.ok(scripts.length <= files, `${kind} downloaded ${scripts.length} script files against a budget of ${files}${note}`);
    } finally {
      await got.browser.close();
    }
  });
}

// A reader gets the words of their own language only: English is always there (the fallback), French and Japanese are chunks of their own.
// The sentences below are long enough to be nowhere else; the Japanese one is checked as the JSON escape too, in case the bundler writes it as \uXXXX.
const escapeJson = (s: string) => JSON.stringify(s).slice(1, -1).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
const sentence = (d: Record<string, string | undefined>) => (d["site.description"] ?? "").slice(0, 40);
const holds = (scripts: Script[], s: string) => scripts.some((x) => x.text.includes(s) || x.text.includes(escapeJson(s)));

test("a page carries the words of the reader's language and no other", async (t) => {
  const got = await browserOrReason();
  if (!got.browser) return t.skip(got.reason);
  try {
    const fr = sentence(FR), ja = sentence(JA);
    assert.ok(fr.length > 20 && ja.length > 20, "the sentences to look for exist");
    const en = await scriptsOf(got.browser, "/");
    assert.ok(!holds(en, fr) && !holds(en, ja), "the English page downloaded French or Japanese words");
    const inFr = await scriptsOf(got.browser, "/", "fr");
    assert.ok(holds(inFr, fr), "the French page did not download the French words");
    assert.ok(!holds(inFr, ja), "the French page downloaded the Japanese words");
    const inJa = await scriptsOf(got.browser, "/", "ja");
    assert.ok(holds(inJa, ja), "the Japanese page did not download the Japanese words");
    assert.ok(!holds(inJa, fr), "the Japanese page downloaded the French words");
  } finally {
    await got.browser.close();
  }
});

// A club's every-game results graph is one square per game: 21,000 for an old MLB club. As one element each the browser spent seconds styling and laying them out on
// a phone (a blocked main thread of 1.5 to 3.7 s at a 4x slower processor, 0.4 to 0.7 s once the squares became a few paths). Only the season-sized graphs may be
// one element a square, where every square takes the keyboard; a long one is a few paths. Count the elements of every graph on a franchise page and a team season page.
for (const path of ["/mlb/team/cincinnati-reds", "/mlb/2007/team/cincinnati-reds"]) {
  test(`a results graph is drawn with a few elements, not one per game (${path})`, async (t) => {
    const got = await browserOrReason();
    if (!got.browser) return t.skip(got.reason);
    const ctx = await got.browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
      await ctx.addCookies([{ name: "spxn-in", value: "1", url: BASE! }]);
      await ctx.addInitScript(() => { try { localStorage.setItem("spxn-probed", "1"); } catch { /* storage may be blocked */ } });
      const page = await ctx.newPage();
      await page.goto(`${BASE}${path}`, { waitUntil: "load" });
      await page.waitForSelector(".rheat svg[data-games]", { state: "attached", timeout: 20000 }).catch(() => {});
      for (let i = 0; i < 80; i++) {
        const done = await page.evaluate(() => { window.scrollBy(0, 600); return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2; });
        await page.waitForTimeout(150);
        if (done) break;
      }
      await page.waitForTimeout(2000);
      const graphs = await page.evaluate(() => [...document.querySelectorAll<SVGSVGElement>(".rheat svg[data-games]")].map((svg) => ({ games: Number(svg.dataset.games), elements: svg.querySelectorAll("*").length })));
      assert.ok(graphs.length > 0, "the page drew no results graph");
      const long = graphs.filter((g) => g.games > 200);
      assert.ok(long.length > 0, `no graph of more than 200 games was drawn: ${JSON.stringify(graphs)}`);
      for (const g of long) assert.ok(g.elements <= 80, `a graph of ${g.games} games is ${g.elements} elements (the budget is 80: labels, one path a result and the ring)`);
      for (const g of graphs.filter((x) => x.games <= 200)) assert.ok(g.elements <= 2 * g.games + 40, `a graph of ${g.games} games is ${g.elements} elements`);
    } finally {
      await got.browser.close();
    }
  });
}
