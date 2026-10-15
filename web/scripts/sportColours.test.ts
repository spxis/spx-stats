import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Run in web/: pnpm test:sportcolours. The six sport colours (--nhl --nba --mlb --nfl --cfl --soccer in globals.css) must stay clearly apart from each
 * other and from the SPX red (--mk-r), in both themes and under the three colour-vision simulations, and must read on the page. The measure is CIEDE2000.
 */
const SPORTS = ["nhl", "nba", "mlb", "nfl", "cfl", "soccer"] as const;
type Sport = (typeof SPORTS)[number];
type Theme = "light" | "dark";

/** Needed apart: CIEDE2000 between any two of the six, and between each and the SPX red. */
const APART = 20;
/** Needed apart under a colour-vision simulation (Machado 2009, full severity). Colours that differ only in hue collapse there, so the bar is lower. */
const APART_CVD = 9;
/** A graphic (swoosh centre, bar, line, map fill) against the page's three grounds. */
const GRAPHIC = 3;
/** Text (and a chosen chip's paper-coloured text) against the same grounds, for the text-safe accent. */
const TEXT = 4.5;

const root = new URL("../src/", import.meta.url).pathname;
const css = readFileSync(join(root, "app/globals.css"), "utf8");

// ---- reading the tokens -------------------------------------------------------------------------------------------------------------------
const block = (open: RegExp): string => {
  const m = open.exec(css);
  assert.ok(m, `globals.css has no block matching ${open}`);
  let depth = 0;
  for (let i = m.index; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(m.index, i + 1);
  }
  throw new Error("unclosed block");
};
const token = (b: string, name: string): string => {
  const m = new RegExp(`(?:^|[\\s{;])--${name}:\\s*#([0-9a-fA-F]{6})\\b`).exec(b);
  assert.ok(m, `--${name} is not a hex in ${b.slice(0, 40)}`);
  return m[1].toLowerCase();
};
const raw = (b: string, name: string): string => {
  const m = new RegExp(`(?:^|[\\s{;])--${name}:\\s*([^;}]+)`).exec(b);
  assert.ok(m, `--${name} missing`);
  return m[1].trim();
};

const lightBlock = block(/^:root \{/m);
const darkMedia = block(/:root:not\(\[data-theme="light"\]\) \{/);
const darkAttr = block(/^:root\[data-theme="dark"\] \{/m);
const markLight = block(/^:root \{ --mk-n/m);
const markDark = block(/^:root\[data-theme="dark"\] \{ --mk-n/m);

const BLOCKS: Record<Theme, string> = { light: lightBlock, dark: darkAttr };
const PALETTE = Object.fromEntries(
  (["light", "dark"] as const).map((t) => [t, Object.fromEntries(SPORTS.map((s) => [s, token(BLOCKS[t], s)])) as Record<Sport, string>]),
) as Record<Theme, Record<Sport, string>>;
const RED: Record<Theme, string> = { light: token(markLight, "mk-r"), dark: token(markDark, "mk-r") };
const GROUNDS: Record<Theme, string[]> = {
  light: ["paper", "panel", "soft"].map((n) => token(lightBlock, n)),
  dark: ["paper", "panel", "soft"].map((n) => token(darkAttr, n)),
};
const INK: Record<Theme, string> = { light: token(lightBlock, "ink"), dark: token(darkAttr, "ink") };
const KEEP: Record<Theme, number> = { light: parseFloat(raw(lightBlock, "accent-keep")), dark: parseFloat(raw(darkAttr, "accent-keep")) };

// ---- colour maths -------------------------------------------------------------------------------------------------------------------------
const rgb = (h: string): [number, number, number] => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const hex = (v: number[]) => v.map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, "0")).join("");
const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linRgb = (h: string) => rgb(h).map(lin) as [number, number, number];
const lumOf = (l: number[]) => 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
const contrast = (a: string, b: string) => {
  const [x, y] = [lumOf(linRgb(a)), lumOf(linRgb(b))];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
type Lab = [number, number, number];
const labOf = ([r, g, b]: [number, number, number]): Lab => {
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};

/** CIEDE2000 (Sharma, Wu and Dalal 2005). */
function de2000([L1, a1, b1]: Lab, [L2, a2, b2]: Lab): number {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2, C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hue = (b: number, a: number) => (b === 0 && a === 0 ? 0 : ((Math.atan2(b, a) / rad) + 360) % 360);
  const h1p = hue(b1, a1p), h2p = hue(b2, a2p);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p) { if (Math.abs(h1p - h2p) > 180) hbp += h1p + h2p < 360 ? 360 : -360; hbp /= 2; }
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
  const dth = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2), Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dth * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

/** Machado, Oliveira and Fernandes 2009, severity 1.0, on linear RGB. */
const SIM = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
} as const;
const simulated = (h: string, m: keyof typeof SIM): Lab => {
  const l = linRgb(h);
  return labOf(SIM[m].map((r) => Math.min(1, Math.max(0, r[0] * l[0] + r[1] * l[1] + r[2] * l[2]))) as [number, number, number]);
};
const seen = (a: string, b: string, m?: keyof typeof SIM) => (m ? de2000(simulated(a, m), simulated(b, m)) : de2000(labOf(linRgb(a)), labOf(linRgb(b))));

/** What `color-mix(in srgb, <accent> <keep>%, <ink>)` gives. */
const mixed = (accent: string, keep: number, ink: string) => hex(rgb(accent).map((v, i) => (v * keep) / 100 + (rgb(ink)[i] * (100 - keep)) / 100));

const THEMES: Theme[] = ["light", "dark"];
const MODES = [undefined, "protanopia", "deuteranopia", "tritanopia"] as const;

// ---- the checks ---------------------------------------------------------------------------------------------------------------------------
test("the CIEDE2000 maths matches the published test pairs", () => {
  assert.ok(Math.abs(de2000([50, 2.6772, -79.7751], [50, 0, -82.7485]) - 2.0425) < 1e-3);
  assert.ok(Math.abs(de2000([50, 2.5, 0], [73, 25, -18]) - 27.1492) < 1e-3);
  assert.ok(Math.abs(de2000([60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387]) - 1.2644) < 1e-3);
});

test("the dark theme is declared the same in the media query and in data-theme", () => {
  for (const s of SPORTS) assert.equal(token(darkMedia, s), PALETTE.dark[s], `--${s} differs between the two dark blocks`);
});

test("every pair of the six is at least CIEDE2000 20 apart, in both themes", () => {
  for (const t of THEMES) {
    for (let i = 0; i < SPORTS.length; i++) {
      for (let j = i + 1; j < SPORTS.length; j++) {
        const [a, b] = [PALETTE[t][SPORTS[i]], PALETTE[t][SPORTS[j]]];
        assert.ok(seen(a, b) >= APART, `${t}: ${SPORTS[i]} #${a} and ${SPORTS[j]} #${b} are ${seen(a, b).toFixed(1)} apart`);
      }
    }
  }
});

test("each of the six is at least CIEDE2000 20 from the SPX red, in both themes", () => {
  for (const t of THEMES) {
    for (const s of SPORTS) {
      const d = seen(PALETTE[t][s], RED[t]);
      assert.ok(d >= APART, `${t}: ${s} #${PALETTE[t][s]} is ${d.toFixed(1)} from the SPX red #${RED[t]}`);
    }
  }
});

test("the six, and the SPX red, stay apart under protanopia, deuteranopia and tritanopia", () => {
  for (const t of THEMES) {
    const all: [string, string][] = [...SPORTS.map((s): [string, string] => [s, PALETTE[t][s]]), ["spx-red", RED[t]]];
    for (const m of MODES.filter((x) => x)) {
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          const d = seen(all[i][1], all[j][1], m);
          assert.ok(d >= APART_CVD, `${t}, ${m}: ${all[i][0]} and ${all[j][0]} are ${d.toFixed(1)} apart`);
        }
      }
    }
  }
});

test("each colour reads as a graphic (3:1) on the page, the panel and the soft ground, in both themes", () => {
  for (const t of THEMES) {
    for (const s of SPORTS) for (const g of GROUNDS[t]) {
      assert.ok(contrast(PALETTE[t][s], g) >= GRAPHIC, `${t}: ${s} #${PALETTE[t][s]} on #${g} is ${contrast(PALETTE[t][s], g).toFixed(2)}:1`);
    }
  }
});

test("the text-safe accent (--accent-text) reads at 4.5:1 for every sport, and so does paper text on it", () => {
  assert.match(css, /--accent-text:\s*color-mix\(in srgb, var\(--accent\) var\(--accent-keep\), var\(--ink\)\)/);
  for (const t of THEMES) {
    for (const s of SPORTS) {
      const text = mixed(PALETTE[t][s], KEEP[t], INK[t]);
      for (const g of GROUNDS[t]) assert.ok(contrast(text, g) >= TEXT, `${t}: ${s} text #${text} on #${g} is ${contrast(text, g).toFixed(2)}:1`);
    }
  }
});

test("the SPX red itself reads on the page (the swoosh centre on pages of no sport)", () => {
  for (const t of THEMES) assert.ok(contrast(RED[t], GROUNDS[t][0]) >= GRAPHIC, `${t}: SPX red on the page`);
});

test("seriesLooks.ts holds the same hex values as globals.css, and nothing else copies them", () => {
  const src = readFileSync(join(root, "lib/seriesLooks.ts"), "utf8");
  const table = /const LEAGUE_HEX[^=]*=\s*\{([\s\S]*?)\n\};/.exec(src);
  assert.ok(table, "LEAGUE_HEX not found");
  for (const s of SPORTS) {
    const m = new RegExp(`${s}:\\s*\\{\\s*light:\\s*"([0-9a-f]{6})",\\s*dark:\\s*"([0-9a-f]{6})"`).exec(table[1]);
    assert.ok(m, `LEAGUE_HEX has no ${s}`);
    assert.equal(m[1], PALETTE.light[s], `${s} light in seriesLooks.ts`);
    assert.equal(m[2], PALETTE.dark[s], `${s} dark in seriesLooks.ts`);
  }
  // The values are written once (globals.css) plus that table; any other file naming one of them is a second copy to keep in step.
  const own = new Set(["app/globals.css", "lib/seriesLooks.ts"]);
  const hexes = new Set(THEMES.flatMap((t) => SPORTS.map((s) => PALETTE[t][s])));
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(css|ts|tsx)$/.test(n) ? [p] : [];
  });
  for (const f of walk(root)) {
    const rel = f.slice(root.length);
    if (own.has(rel)) continue;
    const text = readFileSync(f, "utf8").toLowerCase();
    for (const h of hexes) assert.ok(!text.includes(`#${h}`), `${rel} copies the sport colour #${h}`);
  }
});
