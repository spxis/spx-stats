/**
 * Cuts the SPXIS marks out of John's four converted Illustrator sheets and writes small standalone SVGs to public/brand/
 * (light and dark variants) plus the swoosh's paths for the header (src/lib/brandSwoosh.ts).
 *
 *   node scripts/brand/extractBrand.ts [folder holding the four .svg files]
 *
 * The folder defaults to ~/Projects/handoffs/spx-logos (the originals stay in John's Dropbox and are never modified).
 * Each mark is a rectangle of a sheet's artboard (the sheets paint rows in no tidy order, so the cut is by position).
 * Text is already outlines in the source. Colours are the sheet's own three: navy #00274c, white, red #c9243f.
 * The dark variant swaps navy and white (red stays), so the mark reads light on a navy or near-black page.
 * Re-running rewrites the same bytes. These marks are SPXIS's, not under the site's data licences, and belong in no package.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { centreIn, FRAME, NAVY, RED, WHITE, readSvg, type Box, type Item, type Seg } from "./svgParse.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = process.argv[2] ?? join(homedir(), "Projects/handoffs/spx-logos");
const out = join(here, "../../public/brand");

type Mark = {
  name: string; file: string; rect: Box; prec: number;
  skip?: (i: Item) => boolean;
  /** Keep only the first n items (paint order) after the cut. */
  first?: number;
  /** Merge everything into one navy shape; the white parts become holes (even-odd), so one colour is the whole mark. */
  solid?: boolean;
  /** Paint these colours as others (the swoosh's red centre). */
  recolour?: Record<string, string>;
  /** Only the light file (the mark has its own ring and reads on any page). */
  single?: boolean;
};

/** The centre colour proposed for small sizes: the sheet's red lifted so the oval keeps 3:1 against the navy at 20 px. */
const BRIGHT_RED = "#ee3c57";

/** Rectangles are in each sheet's own units (pt, y down). */
const MARKS: Mark[] = [
  // The same swoosh with a brighter centre (reads better small, on navy and on the dark page).
  { name: "swoosh-bright", file: "SPX-Logo-2006-V5.svg", rect: [100, 415, 230, 499], prec: 2, recolour: { [RED]: BRIGHT_RED } },
  // 2006 V4 sheet, row 4: the swoosh in one colour (no red centre).
  { name: "swoosh-solid", file: "SPX-Logo-2006-V4.svg", rect: [100, 415, 230, 499], prec: 2, solid: true },
  // 2006 V5 sheet, row 4: the star at the far right.
  { name: "star", file: "SPX-Logo-2006-V5.svg", rect: [440, 415, 520, 499], prec: 2 },
  // 2019 sheet: the shield with its text, swoosh and star taken out (its plates: rim, ring, field), the container of BrandShield.
  { name: "shield-empty", file: "SPX-Logo-2019-V1.svg", rect: [0, 0, 288, 288], prec: 2, first: 4 },
  // 2019 sheet: the shield without its two lines of text (swoosh and star kept): the favicon and app icons.
  { name: "shield-icon", file: "SPX-Logo-2019-V1.svg", rect: [0, 0, 288, 288], prec: 2, skip: (i) => i.glyph, single: true },
  // 2006 V5 sheet, row 4 (spxn.com lockup): the swoosh is the x < 230 part; the star at the far right is left out.
  { name: "swoosh", file: "SPX-Logo-2006-V5.svg", rect: [100, 415, 230, 499], prec: 2 },
  { name: "spxn-lockup", file: "SPX-Logo-2006-V5.svg", rect: [100, 415, 520, 499], prec: 1, skip: (i) => i.box[0] > 440 },
  // 2006 V5 sheet, bottom right: the spxn est.1997 shield.
  { name: "spxn-shield", file: "SPX-Logo-2006-V5.svg", rect: [325, 534, 529, 738], prec: 2 },
  // 2019: the SPXIS est.1997 shield.
  { name: "spxis-shield", file: "SPX-Logo-2019-V1.svg", rect: [0, 0, 288, 288], prec: 2 },
  // 2006 V5 sheet, row 1: the words "sportsinteractive / spxn.com" without the small shield (x < 208).
  { name: "sportsinteractive", file: "SPX-Logo-2006-V5.svg", rect: [208, 90, 521, 170], prec: 1 },
  // 2006 V4 sheet, row 2: the spxstats.com lockup.
  { name: "spxstats-lockup", file: "SPX-Logo-2006-V4.svg", rect: [92, 198, 509, 282], prec: 1 },
  // 2006 V4 sheet, row 1: the first SportsInteractive crest with its wordmark (the crest rises above the artboard).
  { name: "sportsinteractive-shield", file: "SPX-Logo-2006-V4.svg", rect: [92, 55, 509, 195], prec: 1 },
  // 2007: the spxinteractivesoftware lockup with the swoosh (sheet row 2).
  { name: "spxis-software-lockup", file: "SPXIS-Logo-2007.svg", rect: [91, 199, 508, 283], prec: 1 },
];

const isFrame = (i: Item) => i.stroke === FRAME || (i.strokeWidth === 0.25 && i.fill === WHITE && i.segs.length === 6);

function num(v: number, prec: number): string {
  const s = v.toFixed(prec);
  const t = s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
  return t === "-0" ? "0" : t;
}

/** Joins numbers with the fewest separators: "1.5-2" and "1.5.5" read the same as "1.5 -2" and "1.5 .5". */
function join2(nums: string[]): string {
  let s = "";
  for (const n of nums) {
    if (!s) s = n;
    else if (n.startsWith("-")) s += n;
    else if (n.startsWith("0.") && /\.\d*$/.test(s)) s += n.slice(1);
    else if (n.startsWith(".") && /\.\d*$/.test(s)) s += n;
    else s += " " + n;
  }
  return s;
}

/** Relative path data (m l h v c z), rounded, tracking the rounded current point so errors never add up. */
function pathData(segs: Seg[], dx: number, dy: number, prec: number): string {
  let d = "";
  let cx = 0, cy = 0, sx = 0, sy = 0;
  const r = (v: number) => Number(v.toFixed(prec));
  let last = "";
  const cmd = (c: string, nums: number[]) => {
    const body = join2(nums.map((n) => num(n, prec)));
    d += (c === last && c !== "m" ? (body.startsWith("-") ? "" : " ") : c) + body;
    last = c;
  };
  for (const s of segs) {
    if (s.c === "M") {
      const x = r(s.p[0] - dx), y = r(s.p[1] - dy);
      cmd("m", [x - cx, y - cy]); cx = sx = x; cy = sy = y;
      last = "l"; // after m, extra pairs are implicit lines; we always start a new command instead
      last = "";
    } else if (s.c === "L") {
      const x = r(s.p[0] - dx), y = r(s.p[1] - dy);
      if (x === cx) cmd("v", [y - cy]);
      else if (y === cy) cmd("h", [x - cx]);
      else cmd("l", [x - cx, y - cy]);
      cx = x; cy = y;
    } else if (s.c === "C") {
      const p = [s.p[0] - dx, s.p[1] - dy, s.p[2] - dx, s.p[3] - dy, s.p[4] - dx, s.p[5] - dy].map(r);
      cmd("c", [p[0] - cx, p[1] - cy, p[2] - cx, p[3] - cy, p[4] - cx, p[5] - cy]);
      cx = p[4]; cy = p[5];
    } else {
      d += "z"; last = ""; cx = sx; cy = sy;
    }
  }
  return d;
}

type Painted = { fill: string | null; rule: string; stroke: string | null; sw: number; segs: Seg[] };

function swapColour(c: string | null): string | null {
  return c === NAVY ? WHITE : c === WHITE ? NAVY : c;
}

/** Cuts one mark: the items whose centre is in the rectangle, in paint order, with the frames and `skip` left out. */
function cut(m: Mark): Item[] {
  const { items } = readSvg(readFileSync(join(src, m.file), "utf8"));
  let got = items.filter((i) => !isFrame(i) && centreIn(i, m.rect) && !m.skip?.(i));
  if (m.first) got = got.slice(0, m.first);
  if (!got.length) throw new Error(`${m.name}: nothing in ${m.rect}`);
  if (m.solid) got = [{ ...got[0], fill: NAVY, rule: "evenodd", stroke: null, strokeWidth: 0, glyph: false, segs: got.flatMap((i) => i.segs) }];
  if (m.recolour) got = got.map((i) => ({ ...i, fill: (i.fill && m.recolour![i.fill]) || i.fill }));
  return got;
}

function boundsOf(items: Item[]): Box {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const i of items) {
    const h = i.stroke ? i.strokeWidth / 2 : 0;
    x0 = Math.min(x0, i.box[0] - h); y0 = Math.min(y0, i.box[1] - h); x1 = Math.max(x1, i.box[2] + h); y1 = Math.max(y1, i.box[3] + h);
  }
  return [x0, y0, x1, y1];
}

/** Merges runs of plain fills of one colour (letters, rows of tiles) into one path each; strokes stay as they are. */
function paint(items: Item[], swap: boolean): Painted[] {
  const list: Painted[] = [];
  for (const i of items) {
    const fill = swap ? swapColour(i.fill) : i.fill;
    const stroke = swap ? swapColour(i.stroke) : i.stroke;
    const prev = list[list.length - 1];
    if (prev && !stroke && !prev.stroke && prev.fill === fill && prev.rule === i.rule) prev.segs = prev.segs.concat(i.segs);
    else list.push({ fill, rule: i.rule, stroke, sw: i.strokeWidth, segs: i.segs });
  }
  return list;
}

function svgText(m: Mark, items: Item[], swap: boolean): { text: string; w: number; h: number; paths: Painted[]; dx: number; dy: number } {
  const [x0, y0, x1, y1] = boundsOf(items);
  const w = Number((x1 - x0).toFixed(1)), h = Number((y1 - y0).toFixed(1));
  const paths = paint(items, swap);
  const body = paths.map((p) => {
    const d = pathData(p.segs, x0, y0, m.prec);
    if (p.stroke) return `<path fill="none" stroke="${p.stroke}" stroke-width="${num(p.sw, 2)}" d="${d}"/>`;
    return `<path${p.fill === "#000000" ? "" : ` fill="${p.fill}"`}${p.rule === "evenodd" ? ' fill-rule="evenodd"' : ""} d="${d}"/>`;
  });
  const text = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(w, 1)} ${num(h, 1)}">${body.join("")}</svg>\n`;
  return { text, w, h, paths, dx: x0, dy: y0 };
}

mkdirSync(out, { recursive: true });
let total = 0;
const dims: Record<string, { w: number; h: number }> = {};
for (const m of MARKS) {
  const items = cut(m);
  for (const swap of m.single ? [false] : [false, true]) {
    const r = svgText(m, items, swap);
    const file = join(out, `${m.name}${swap ? "-dark" : ""}.svg`);
    writeFileSync(file, r.text);
    total += r.text.length;
    dims[m.name] = { w: r.w, h: r.h };
    console.log(`${m.name}${swap ? "-dark" : ""}.svg  ${r.text.length} bytes  ${num(r.w, 1)} x ${num(r.h, 1)}`);
    if (m.name === "swoosh" && !swap) {
      // The header draws the swoosh inline, so one copy of the artwork follows the page's light or dark theme through CSS
      // variables: n = navy (light) / white (dark), g = the gap ring (white on light, the page colour on dark), r = red.
      const cls = (c: string | null) => (c === NAVY ? "n" : c === WHITE ? "g" : "r");
      const parts = r.paths.map((p) => ({ k: cls(p.stroke ?? p.fill), stroke: Boolean(p.stroke), sw: p.sw, d: pathData(p.segs, r.dx, r.dy, 2), rule: p.rule }));
      const ts = `/* Generated by scripts/brand/extractBrand.ts from John's SPXIS swoosh. © SportsInteractive: not under the site's data licences. */
export const SWOOSH = ${JSON.stringify({ w: r.w, h: r.h, parts }, null, 2)} as const;
`;
      writeFileSync(join(here, "../../src/lib/brandSwoosh.ts"), ts);
    }
    if (m.name === "shield-empty" && !swap) {
      // The three plates of the empty shield, in paint order: rim, ring (white, with the gaps as holes), field (the band and the body, one navy shape).
      const ts = `/* Generated by scripts/brand/extractBrand.ts from John's SPXIS shield. © SportsInteractive: not under the site's data licences. */
export const SHIELD = ${JSON.stringify({ w: r.w, h: r.h, plates: r.paths.map((p, n) => ({ id: ["rim", "ring", "field"][n], d: pathData(p.segs, r.dx, r.dy, 2) })) }, null, 2)} as const;
`;
      writeFileSync(join(here, "../../src/lib/brandShield.ts"), ts);
    }
  }
}
writeFileSync(join(here, "../../src/lib/brandMarks.ts"), `/* Generated by scripts/brand/extractBrand.ts: the size of each SVG in public/brand (<name>.svg and <name>-dark.svg). © SportsInteractive: not under the site's data licences. */
export const BRAND_MARKS = ${JSON.stringify(dims, null, 2)} as const;
export type BrandName = keyof typeof BRAND_MARKS;
`);
console.log(`total ${total} bytes`);
