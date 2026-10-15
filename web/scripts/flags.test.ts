import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { FLAG_HEIGHT, FLAG_ROUND_HERO, FLAG_ROUND_LARGE, FLAG_SIDE, FLAG_FILE, FLAG_WIDTH, HATA_SHAPE, flagAddress, sizeFlagSvg } from "../src/lib/flagSvg.ts";

/**
 * Run in web/: pnpm test:flags
 * The first tests need nothing. The browser test needs a running site (pnpm build && pnpm start, or pnpm dev) at
 * SPX_BASE_URL (default http://localhost:7701) and Chromium for playwright-core; it is skipped, with the reason, when either is missing.
 */

test("sizeFlagSvg gives Hata's drawing the fixed box and keeps its viewBox", () => {
  const out = sizeFlagSvg('<svg data-hata="ca" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9600 4800"><path d="M0 0"/></svg>');
  assert.match(out, new RegExp(`^<svg width="${FLAG_WIDTH}" height="${FLAG_HEIGHT}" aria-hidden="true" focusable="false" data-hata="ca"`));
  assert.ok(out.includes('viewBox="0 0 9600 4800"'));
  assert.ok(!out.includes("preserveAspectRatio"), "contained is the default; never 'none', which would stretch");
});

test("sizeFlagSvg replaces a size the drawing already carried", () => {
  const out = sizeFlagSvg('<svg width="640" height="480" viewBox="0 0 4 3"></svg>');
  assert.equal((out.match(/width=/g) ?? []).length, 1);
  assert.equal((out.match(/height=/g) ?? []).length, 1);
});

test("sizeFlagSvg gives the round and square shapes the 18px box", () => {
  for (const shape of ["round", "square"] as const) {
    const out = sizeFlagSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 0"/></svg>', shape);
    assert.match(out, new RegExp(`^<svg width="${FLAG_SIDE}" height="${FLAG_SIDE}" aria-hidden="true" focusable="false"`));
    assert.ok(out.includes('viewBox="0 0 512 512"'));
  }
});

test("the round and square shapes are Hata's own frames, never clipped by hand", () => {
  assert.deepEqual(HATA_SHAPE, { rect: undefined, round: { shape: "round" }, square: { shape: "1:1" } });
});

test("a flag is an image of its own file, named by code and shape, and the file name reads back", () => {
  assert.equal(flagAddress("ca"), "/flag/CA.svg");
  assert.equal(flagAddress("es", "round"), "/flag/ES.round.svg");
  assert.equal(flagAddress("gb-eng", "square"), "/flag/GB-ENG.square.svg");
  for (const shape of ["rect", "round", "square"] as const) {
    const m = FLAG_FILE.exec(flagAddress("gb-eng", shape).slice("/flag/".length));
    assert.deepEqual([m?.[1], m?.[2] ?? "rect"], ["GB-ENG", shape]);
  }
  for (const bad of ["../x.svg", "CA.png", "CANADA.svg", "CA.round.round.svg", "C.svg"]) assert.equal(FLAG_FILE.test(bad), false, bad);
});

test("flag.css uses the same numbers as flagSvg.ts", () => {
  const css = readFileSync(new URL("../src/components/flag.css", import.meta.url), "utf8");
  assert.ok(css.includes(`width: ${FLAG_WIDTH}px; height: ${FLAG_HEIGHT}px`));
  assert.equal((css.match(new RegExp(`width: ${FLAG_WIDTH}px; height: ${FLAG_HEIGHT}px`, "g")) ?? []).length, 2);
  assert.equal((css.match(new RegExp(`width: ${FLAG_SIDE}px; height: ${FLAG_SIDE}px`, "g")) ?? []).length, 2);
});

test("the large round flag of the World Cup headings has its own box, and only that one", () => {
  const css = readFileSync(new URL("../src/components/flag.css", import.meta.url), "utf8");
  assert.equal((css.match(new RegExp(`width: ${FLAG_ROUND_LARGE}px; height: ${FLAG_ROUND_LARGE}px`, "g")) ?? []).length, 2);
  assert.ok(FLAG_ROUND_LARGE > FLAG_SIDE);
});

test("the hero round flag of the match banner has its own box too", () => {
  const css = readFileSync(new URL("../src/components/flag.css", import.meta.url), "utf8");
  assert.equal((css.match(new RegExp(`width: ${FLAG_ROUND_HERO}px; height: ${FLAG_ROUND_HERO}px`, "g")) ?? []).length, 2);
  assert.ok(FLAG_ROUND_HERO > FLAG_ROUND_LARGE);
});

test("no other stylesheet sizes a flag", () => {
  for (const f of ["people.css", "team.css", "city.css"]) {
    const css = readFileSync(new URL(`../src/components/${f}`, import.meta.url), "utf8");
    assert.ok(!/\.(pflag|tflag)\b/.test(css), `${f} still styles an old flag class`);
  }
});

const BASE = (process.env.SPX_BASE_URL ?? "http://localhost:7701").replace(/\/$/, "");
// Pages with flags: the roster and its country filter, a player, a city, the cities list, the team heading, the players list.
// The roster is an MLB club: NHL birth countries are held for only 5% of players (a Canucks roster has just one country, so no filter), MLB for 99%.
// `rounds` and `rects` are the least number of round and rectangle flags each page must show (the filter buttons and chips are round, the table columns and headings rectangles).
const PAGES: [string, string, { rounds: number; rects: number } | null][] = [
  ["roster and country filter", "/mlb/2024/team/toronto-blue-jays?nat=CA#roster", { rounds: 2, rects: 1 }],
  ["player page", "/nhl/player/quinn-hughes-2787", null],
  ["city page", "/city/vancouver", null],
  ["cities list", "/cities", null],
  ["players list", "/players?nat=CA&sort=name.asc", { rounds: 1, rects: 0 }],
  // The World Cup pages draw round flags from one sprite (components/SoccerFlag.tsx): 18px in lists, 56px in the heading of a pairing or team, 72px in the match banner.
  ["world cup match", "/worldcup/2022/match/2600-argentina-france", { rounds: 4, rects: 0 }],
  ["world cup head to head", "/worldcup/head-to-head/argentina-vs-france", { rounds: 4, rects: 0 }],
  ["world cup team", "/worldcup/team/argentina", { rounds: 2, rects: 0 }],
];

async function browserOrReason() {
  try {
    const res = await fetch(`${BASE}/`, { method: "HEAD", signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { reason: `${BASE} answered ${res.status}` };
  } catch {
    return { reason: `nothing is listening at ${BASE} (start the site, or set SPX_BASE_URL)` };
  }
  try {
    const { chromium } = await import("playwright-core");
    return { browser: await chromium.launch() };
  } catch (e) {
    return { reason: `no Chromium for playwright-core: ${(e as Error).message.split("\n")[0]}` };
  }
}

test("every flag on the page is the same fixed size at desktop and phone width", async (t) => {
  const got = await browserOrReason();
  if (!got.browser) return t.skip(got.reason);
  const { browser } = got;
  try {
    for (const width of [1280, 375]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      for (const [what, path, want] of PAGES) {
        await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
        const found = await page.evaluate(() => {
          const box = (e: Element) => { const r = e.getBoundingClientRect(); return [Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]; };
          return {
            flags: [...document.querySelectorAll(".flag")].map((e) => ({ outer: box(e), svg: e.querySelector("svg, img") ? box(e.querySelector("svg, img")!) : null, shaped: e.classList.contains("flag-round") || e.classList.contains("flag-square"), large: e.classList.contains("flag-lg"), hero: e.classList.contains("flag-hero") })),
            stray: document.querySelectorAll("svg[data-hata]:not(.flag svg), img[src^=\"/flag/\"]:not(.flag img)").length,
          };
        });
        // The players list is only required to be tidy once the country column exists; the others must show flags.
        if (!path.startsWith("/players")) assert.ok(found.flags.length > 0, `${what} at ${width}px: no flags found`);
        for (const f of found.flags) {
          const want = f.hero ? [FLAG_ROUND_HERO, FLAG_ROUND_HERO] : f.large ? [FLAG_ROUND_LARGE, FLAG_ROUND_LARGE] : f.shaped ? [FLAG_SIDE, FLAG_SIDE] : [FLAG_WIDTH, FLAG_HEIGHT];
          assert.deepEqual(f.outer, want, `${what} at ${width}px: flag box is ${f.outer}`);
          assert.deepEqual(f.svg, want, `${what} at ${width}px: flag drawing is ${f.svg}`);
        }
        // Country buttons and chips are round; table columns and headings stay rectangles.
        if (want) {
          const rounds = found.flags.filter((f) => f.shaped).length;
          assert.ok(rounds >= want.rounds, `${what} at ${width}px: ${rounds} round flags, expected at least ${want.rounds}`);
          assert.ok(found.flags.length - rounds >= want.rects, `${what} at ${width}px: expected rectangle flags too`);
        }
        assert.equal(found.stray, 0, `${what} at ${width}px: a flag is drawn outside the shared component`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
