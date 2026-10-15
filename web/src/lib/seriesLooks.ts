/**
 * Colours for a showdown: each team's block colour (its own brand, drawn the same in both themes) and the
 * colour its lines and bars take on the page, worked out for the light and the dark paper so that two teams
 * with alike colours still read apart. When the two clubs' colours are too close the second side moves to its
 * other colour, and failing that to a lighter or darker shade of its own primary (same hue), never to white or
 * another near-white. Text on every block meets WCAG AA (4.5:1).
 */
import { contrast, lum, PAPER } from "./brand.ts";

export interface SideLook {
  /** The block behind the team's name, a hex without #. */
  block: string;
  /** Text on the block: white or near-black, whichever reads. */
  on: string;
  /** Chart colour on each theme's paper. */
  light: string;
  dark: string;
}

type Theme = "light" | "dark";

/** What a look is worked out from: a club's brand row, or any pair of colours (a national team's flag colours). Hex without #. */
export interface Colours { primary_hex?: string | null; secondary_hex?: string | null }

/** Two colours count as alike below this CIE76 distance (Lab); 30 is plainly two different colours side by side. */
export const APART = 30;
/** A block lighter than this (relative luminance) is a white-ish panel, which reads as broken, so it is never used. */
export const TOO_LIGHT = 0.6;
/** A chart line lighter than this is near-white: hard to see on the light paper and glaring on the dark. */
const LINE_TOO_LIGHT = 0.75;
/** Contrast a line or bar needs against the page. */
const LINE_CONTRAST = 3;
/** Contrast text needs against its block (WCAG AA for normal text). */
export const TEXT_CONTRAST = 4.5;

const lower = (h: string) => h.toLowerCase();
const rgb = (h: string): [number, number, number] => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (v: [number, number, number]) => v.map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, "0")).join("");

/** CIE Lab (D65) of a hex colour. */
function lab(h: string): [number, number, number] {
  const [r, g, b] = rgb(h).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
/** How different two colours look: CIE76 distance in Lab. */
export function deltaE(a: string, b: string): number {
  const [x, y] = [lab(a), lab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

function toHsl(h: string): [number, number, number] {
  const [r, g, b] = rgb(h).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(hue * 60 + 360) % 360, s, l];
}
function fromHsl(hue: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

/**
 * Lighter and darker shades of a colour, same hue and saturation, nearest first (5 points of lightness a step), the direction
 * that moves away from `awayFrom` leading. Used when a club's own colours are too close to its rival's.
 */
function shades(h: string, awayFrom?: string): string[] {
  const [hue, s, l] = toHsl(h);
  const lighterFirst = awayFrom ? lab(awayFrom)[0] <= lab(h)[0] : true;
  const out: string[] = [];
  for (let k = 1; k <= 16; k++) {
    const pair = [l + 0.05 * k, l - 0.05 * k];
    if (!lighterFirst) pair.reverse();
    for (const v of pair) if (v >= 0.1 && v <= 0.9) out.push(fromHsl(hue, s, v));
  }
  return out;
}

/** The league's own colour in each theme (the --nhl... tokens), used when a team has no colours on record. Kept equal to globals.css by pnpm test:sportcolours. */
const LEAGUE_HEX: Record<string, { light: string; dark: string }> = {
  nhl: { light: "0a86ee", dark: "6cd0ff" }, nba: { light: "cf6d12", dark: "e08a1a" }, mlb: { light: "c169ad", dark: "f194cc" },
  nfl: { light: "0a7038", dark: "7fe05a" }, cfl: { light: "5a52ac", dark: "8d91fe" },
  soccer: { light: "00858a", dark: "11a695" },
};
const NEUTRALS = [{ light: "5d6874", dark: "9aa4ad" }, { light: "b07a12", dark: "e0a83d" }];

const ON_DARK = "ffffff", ON_LIGHT = "12161b", ON_BLACK = "000000";
/** Text on a block: white or near-black, whichever reads better; pure black for the mid-tones where neither reaches 4.5:1. */
export function onBlock(hex: string): string {
  const best = contrast(hex, ON_DARK) >= contrast(hex, ON_LIGHT) ? ON_DARK : ON_LIGHT;
  if (contrast(hex, best) >= TEXT_CONTRAST) return best;
  return contrast(hex, ON_DARK) >= contrast(hex, ON_BLACK) ? ON_DARK : ON_BLACK;
}

/** A team's own colours, primary first. */
const own = (b: Colours | null): string[] => [b?.primary_hex, b?.secondary_hex].filter((h): h is string => !!h).map(lower);

/** The first colour of `pool` that passes `ok`, or null. */
const first = (pool: string[], ok: (h: string) => boolean): string | null => pool.find(ok) ?? null;

/**
 * The block colour of a side. The first side keeps its primary (its secondary when the primary is white-ish). The second keeps its
 * primary too unless it is close to the first side's block; then its secondary if that is not white-ish and is apart, then a
 * lighter or darker shade of its primary, then a neutral grey.
 */
function blockOf(colours: string[], other: string | null, fallback: string): string {
  const ok = (h: string) => lum(h) <= TOO_LIGHT && (!other || deltaE(h, other) >= APART);
  const pool = [...colours, ...(colours[0] ? shades(colours[0], other ?? undefined) : [])];
  return first(pool, ok) ?? (other ? first(NEUTRALS.map((n) => n.light), ok) : null) ?? fallback;
}

/** The line colour of a side on one theme's paper. `apart` is the other side's line colour, for the second side. */
function lineOf(theme: Theme, colours: string[], fallbacks: string[], apart: string | null): string {
  const paper = PAPER[theme];
  const reads = (h: string) => contrast(h, paper) >= LINE_CONTRAST && lum(h) <= LINE_TOO_LIGHT;
  const ok = (h: string) => reads(h) && (!apart || deltaE(h, apart) >= APART);
  const pool = [...colours, ...(colours[0] ? shades(colours[0], apart ?? undefined) : [])];
  return first(pool, ok) ?? first(fallbacks, ok) ?? first(pool, reads) ?? first(fallbacks, reads) ?? fallbacks.at(-1)!;
}

/** The two teams' looks. `a` is the first side (the winner on a series page); `b` is the side that gives way when the two are close. */
export function seriesLooks(league: string, a: Colours | null, b: Colours | null): [SideLook, SideLook] {
  const lg = LEAGUE_HEX[league] ?? LEAGUE_HEX.nhl;
  const ca = own(a), cb = own(b);

  const blockA = blockOf(ca, null, lg.light);
  const blockB = blockOf(cb, blockA, NEUTRALS[0].light);

  const out = (theme: Theme) => {
    const x = lineOf(theme, ca, [lg[theme]], null);
    const y = lineOf(theme, cb, [NEUTRALS[0][theme], NEUTRALS[1][theme], lg[theme]], x);
    return [x, y] as const;
  };
  const [lx, ly] = out("light"), [dx, dy] = out("dark");
  return [
    { block: blockA, on: onBlock(blockA), light: lx, dark: dx },
    { block: blockB, on: onBlock(blockB), light: ly, dark: dy },
  ];
}
