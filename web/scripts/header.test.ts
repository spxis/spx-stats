import assert from "node:assert/strict";
import { test } from "node:test";

/**
 * The header at every width: the open sport's links (Scores, All-time, More hockey) share one line, no two items overlap or run off the page, the page
 * does not scroll sideways, and the header is as tall signed in as signed out. Opens real pages in Chromium, in English, French and Japanese (the words
 * differ in length), signed out and with the signed-in hint (/api/me answered by the test, so nothing is signed in for real).
 *
 * Run in web/ against a running site on a port of this project's block (a built one: `SPX_AUTH_CONFIGURED=1 SPX_REST_URL=http://127.0.0.1:7750/ pnpm build`,
 * then `pnpm start -p 77xx`; the sign-in link only exists with auth configured):
 *   PAGES_URL=http://localhost:7725 pnpm test:header
 * Skipped, with the reason, when PAGES_URL is not set or there is no Chromium for playwright-core. Never point it at production.
 */
const BASE = process.env.PAGES_URL;
const WIDTHS = [320, 390, 768, 870, 1024, 1280, 1440, 1920];
const PATHS = ["/nhl", "/nba", "/"];
const LOCALES = ["en", "fr", "ja"];

async function browserOrReason() {
  if (!BASE) return { reason: "set PAGES_URL to a running site (pnpm build && pnpm start) to measure the header" };
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

type Box = { text: string; left: number; right: number; top: number; bottom: number };

for (const locale of LOCALES) {
  test(`header (${locale}): one line of sport links, nothing overlapping, no sideways scroll, same height signed in or out`, async (t) => {
    const got = await browserOrReason();
    if (!got.browser) return t.skip(got.reason);
    const { browser } = got;
    try {
      for (const path of PATHS) {
        for (const width of WIDTHS) {
          const heights: number[] = [];
          for (const signedIn of [false, true]) {
            const where = `${locale} ${path} ${width}px ${signedIn ? "signed in" : "signed out"}`;
            const ctx = await browser.newContext({ viewport: { width, height: 500 } });
            await ctx.addCookies([{ name: "spxn-locale", value: locale, url: BASE! }, ...(signedIn ? [{ name: "spxn-in", value: "1", url: BASE! }] : [])]);
            const page = await ctx.newPage();
            if (signedIn) await page.route("**/api/me", (r) => r.fulfill({ json: { user: { name: "John Morris", email: "j@example.com", image: null, admin: false }, bar: null } }));
            await page.goto(`${BASE}${path}`, { waitUntil: "load" });
            await page.waitForLoadState("networkidle").catch(() => {});
            if (signedIn) await page.waitForSelector("header .usermenu-btn");
            await page.waitForTimeout(300);
            const m = await page.evaluate(() => {
              const rect = (e: Element): Box => { const r = e.getBoundingClientRect(); return { text: (e.textContent ?? "").trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
              const header = document.querySelector("header.top")!;
              return {
                height: header.getBoundingClientRect().height,
                scrollWidth: document.documentElement.scrollWidth,
                clientWidth: document.documentElement.clientWidth,
                items: [...header.querySelectorAll(".brand, .lg-main > a, .lg-sub > a, .aux a, .aux button")].map(rect),
                sub: [...header.querySelectorAll(".lg-sub > a")].map(rect),
                main: [...header.querySelectorAll(".lg-main > a")].map(rect),
                aux: [...header.querySelectorAll(".aux a, .aux button")].map(rect),
              };
            });
            heights.push(m.height);
            assert.ok(m.scrollWidth <= m.clientWidth, `${where}: the page scrolls sideways (${m.scrollWidth} > ${m.clientWidth})`);
            for (const b of m.items) assert.ok(b.left >= -0.5 && b.right <= width + 0.5, `${where}: "${b.text}" runs off the page (${Math.round(b.left)} to ${Math.round(b.right)})`);
            for (let i = 0; i < m.items.length; i++) {
              for (let j = i + 1; j < m.items.length; j++) {
                const a = m.items[i], b = m.items[j];
                const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
                assert.ok(!overlap, `${where}: "${a.text}" and "${b.text}" overlap`);
              }
            }
            // The open sport's links stay together on one line, at the widths people use (the narrowest phone may break a long French or Japanese line).
            if (m.sub.length > 1 && width >= 390) {
              const tops = m.sub.map((b) => Math.round(b.top));
              assert.ok(Math.max(...tops) - Math.min(...tops) <= 2, `${where}: the sport's links are on more than one line (${m.sub.map((b) => `${b.text}@${Math.round(b.top)}`).join(", ")})`);
            }
            // Wide enough for one row: the account controls sit level with the sports line, not on a row of their own below.
            if (width >= 1440 && locale === "en" && m.main.length > 0) {
              const mainBottom = Math.max(...m.main.map((b) => b.bottom));
              for (const b of m.aux) assert.ok((b.top + b.bottom) / 2 <= mainBottom, `${where}: "${b.text}" sits below the sports line`);
            }
            await ctx.close();
          }
          assert.ok(Math.abs(heights[0] - heights[1]) <= 1, `${locale} ${path} ${width}px: the header is ${heights[0]}px signed out and ${heights[1]}px signed in`);
        }
      }
    } finally {
      await browser.close();
    }
  });
}
