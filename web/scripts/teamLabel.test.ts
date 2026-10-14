import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

/**
 * Run in web/: pnpm test:label
 * A team named in a list, table or card is drawn by TeamLabel (src/components/TeamLabel.tsx): its small logo, then its name as a link.
 * The first tests read the source and need nothing; they fail when a component names a team some other way, which is how the
 * Seasons table on a player's page came to show no logos while every other list did. The browser test needs a running site
 * (pnpm build && pnpm start, or pnpm dev) at SPX_BASE_URL (default http://localhost:3100) and Chromium for playwright-core; it is
 * skipped, with the reason, when either is missing.
 */

const SRC = new URL("../src/", import.meta.url).pathname;

function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}
const rel = (path: string) => relative(SRC, path);
const read = (path: string) => readFileSync(path, "utf8");

/** Every `<Link ...>...</Link>` that does not nest another Link: the opening tag (attributes) and what is inside. */
export function links(code: string): { tag: string; inner: string; before: string }[] {
  const out: { tag: string; inner: string; before: string }[] = [];
  const re = /<Link\b/g;
  for (let m = re.exec(code); m; m = re.exec(code)) {
    // The opening tag ends at the first `>` outside braces and strings (an arrow function in an attribute holds one).
    let depth = 0, quote = "", i = m.index + 5;
    for (; i < code.length; i++) {
      const c = code[i];
      if (quote) { if (c === quote) quote = ""; continue; }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0 && code[i - 1] !== "=") break;
    }
    if (code[i - 1] === "/") continue; // self-closing
    const end = code.indexOf("</Link>", i);
    if (end < 0) continue;
    out.push({ tag: code.slice(m.index, i + 1), inner: code.slice(i + 1, end), before: code.slice(Math.max(0, m.index - 120), m.index) });
  }
  return out;
}

/** A link to a team's own page (or a head-to-head with it) whose text is the team's name: that is a TeamLabel's job, with its logo. */
export function bareTeamLinks(code: string): string[] {
  return links(code)
    .filter(({ tag }) => /paths\.team(Season)?\(|pairPath\(/.test(tag))
    // Words, numbers and cards are fine: the text comes from say(), a season label, a record or a count.
    .filter(({ inner }) => !/\bsay\(|seasonLabel\(|\bsp\.say\(|\.gp\b|\brec\(|scoreText\(|\.label\b/.test(inner))
    // The heading of a showdown card sits under its big crest, which is the logo (a side of components/Showdown.tsx: its `name:`).
    .filter(({ before, tag }) => !/className="sdname"/.test(before + tag) && !/\bname:\s*$/.test(before))
    .map(({ inner }) => inner.trim());
}

test("a team link is drawn by TeamLabel only", () => {
  const found = sources().flatMap((file) => {
    const code = read(file);
    const name = rel(file);
    if (name === "components/TeamLabel.tsx") return [];
    const defines = name === "components/ui.tsx"; // TeamLink itself
    const own = [...code.matchAll(/<TeamLink\b/g)].map(() => `${name}: <TeamLink> used directly; use <TeamLabel logo={logoFor(brands, f, year)} ...>`);
    const bare = (defines ? [] : bareTeamLinks(code)).map((t) => `${name}: a team's name as a plain link (${t.slice(0, 60)}); use <TeamLabel>`);
    return [...own, ...bare];
  });
  assert.deepEqual(found, []);
});

test("the scanner flags a bare team link and passes a label, a season link and a showdown heading", () => {
  assert.equal(bareTeamLinks('<Link href={paths.team(lg, f)} prefetch={false}>{r.team}</Link>').length, 1);
  assert.equal(bareTeamLinks('<Link href={paths.teamSeason(lg, f, y)} prefetch={false}><span className="tn-long">{r.team}</span></Link>').length, 1);
  assert.equal(bareTeamLinks('<Link href={pairPath(paths, lg, f, m.f).path} prefetch={false}>{nameOf(m.f)}</Link>').length, 1);
  assert.equal(bareTeamLinks('<Link onClick={() => go()} href={paths.team(lg, f)}>{name}</Link>').length, 1);
  assert.equal(bareTeamLinks('<TeamLabel lg={lg} f={f} name={n} logo={logoFor(brands, f, y)} />').length, 0);
  assert.equal(bareTeamLinks('<Link href={paths.team(lg, f)}>{say("tseason.allSeasons")}</Link>').length, 0);
  assert.equal(bareTeamLinks('<Link href={paths.teamSeason(lg, f, y)}>{seasonLabel(lg, y)}</Link>').length, 0);
  assert.equal(bareTeamLinks('<h2 className="sdname"><Link href={paths.team(lg, f)} prefetch={false}>{name[i]}</Link></h2>').length, 0);
  assert.equal(bareTeamLinks('{ crest, name: <Link href={paths.team(lg, f)} prefetch={false}>{name[i]}</Link>, tag }').length, 0);
  assert.equal(bareTeamLinks('<Link href={`/city/${slug}`}>{city.name}</Link>').length, 0);
});

test("a logo comes from logoFor, never from the brand row picked for its colours", () => {
  // brandFor() prefers the row with colours, and that row often has no logo: reading logo_url off it left a player's seasons without logos.
  const found = sources().flatMap((file) => {
    const code = read(file);
    const name = rel(file);
    return [...code.matchAll(/brandFor\([^)]*\)\??\.logo_url/g)].map(() => `${name}: logo_url read off brandFor(); use logoFor()`);
  });
  assert.deepEqual(found, []);
});

test("TeamLabel passes the logo on, and the logo has one size and one stylesheet", () => {
  const label = read(join(SRC, "components/TeamLabel.tsx"));
  assert.match(label, /logo: string \| null \| undefined;/, "the logo prop is required (null for none), so a caller cannot forget it");
  assert.ok(label.includes("<TeamLogo url={logo}") && label.includes("<TeamLink"));
  const size = Number(/export const LOGO_SIZE = (\d+);/.exec(read(join(SRC, "components/TeamLogo.tsx")))?.[1]);
  assert.ok(size > 0, "LOGO_SIZE is exported from TeamLogo.tsx");
  const css = read(join(SRC, "components/teamlogo.css"));
  assert.ok(css.includes(`height: var(--s, ${size}px)`) && css.includes(`min-width: var(--s, ${size}px)`), "teamlogo.css defaults to LOGO_SIZE");
  assert.ok(read(join(SRC, "components/TeamLogo.tsx")).includes("width={size} height={size}"), "the image carries its box, so the page does not jump when it loads");
  const globals = read(join(SRC, "app/globals.css"));
  assert.ok(!/^\s*\.logo\s*\{/m.test(globals), "globals.css must not size the logo; teamlogo.css does");
});

const BASE = (process.env.SPX_BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");

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

test("each club in a player's Seasons table carries its logo, the same small size at desktop and phone width", async (t) => {
  const got = await browserOrReason();
  if (!got.browser) return t.skip(got.reason);
  const { browser } = got;
  try {
    for (const width of [1280, 375]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`${BASE}/nhl/player/mark-messier-2359`, { waitUntil: "domcontentloaded" });
      const rows = await page.evaluate(() => {
        const h2 = [...document.querySelectorAll("section h2")].find((h) => h.nextElementSibling?.classList.contains("tablebox"));
        const tbody = h2?.parentElement?.querySelector("tbody");
        return [...(tbody?.querySelectorAll("tr") ?? [])].map((tr) => {
          const cell = tr.querySelector("td.team");
          const link = cell?.querySelector("a");
          const logo = cell?.querySelector("img.logo");
          const box = logo ? logo.getBoundingClientRect() : null;
          return { club: link?.textContent ?? "", logo: !!logo, h: box ? Math.round(box.height) : 0, w: logo?.getAttribute("width") ?? null, after: !!(logo && link && logo.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING) };
        });
      });
      assert.ok(rows.length > 10, `${width}px: the Seasons table has rows`);
      // Messier's clubs all have logos in the era he played (the Rangers, Canucks and Oilers have held theirs since the 1970s).
      for (const club of ["New York Rangers", "Vancouver Canucks", "Edmonton Oilers"]) {
        const mine = rows.filter((r) => r.club === club);
        assert.ok(mine.length > 0, `${width}px: no ${club} row`);
        for (const r of mine) {
          assert.ok(r.logo && r.after, `${width}px: a ${club} row has no logo before its name`);
          assert.equal(r.h, 20, `${width}px: the ${club} logo is ${r.h}px high, not the shared 20`);
          assert.equal(r.w, "20");
        }
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
