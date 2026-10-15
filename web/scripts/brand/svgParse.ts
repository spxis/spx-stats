/**
 * A tiny reader for the PDF-converted SVGs John's corporate logos came in (cairo output: only M L C Z paths, `<use>` of
 * glyph paths for text, one flip transform). It turns each file into a flat, painted-in-order list of absolute paths, so
 * marks can be cut out, recoloured and written back as small standalone SVGs (extractBrand.ts). No dependencies.
 */

export type Pt = [number, number];
export type Seg = { c: "M" | "L" | "C" | "Z"; p: number[] };
export type Box = [number, number, number, number];
export type Item = {
  segs: Seg[];
  fill: string | null;
  rule: "nonzero" | "evenodd";
  stroke: string | null;
  strokeWidth: number;
  /** The tight box of the drawn outline (curves sampled), in the file's own coordinates. */
  box: Box;
  /** True for a glyph of the file's text (the pieces of a word share one fill and are merged). */
  glyph: boolean;
};

export const NAVY = "#00274c";
export const WHITE = "#ffffff";
export const RED = "#c9243f";
export const FRAME = "#2e3092";

/** "rgb(0%, 15.29%, 29.8%)" to "#00274c", checked against the three brand colours (and the artboard frame blue). */
export function colour(s: string): string | null {
  if (s === "none") return null;
  const m = /rgb\(([\d.]+)%,\s*([\d.]+)%,\s*([\d.]+)%\)/.exec(s);
  if (!m) throw new Error(`unknown colour ${s}`);
  const hex = "#" + [m[1], m[2], m[3]].map((v) => Math.round((Number(v) * 255) / 100).toString(16).padStart(2, "0")).join("");
  if (![NAVY, WHITE, RED, FRAME].includes(hex)) throw new Error(`colour ${hex} is not a brand colour`);
  return hex;
}

function parseD(d: string): Seg[] {
  const out: Seg[] = [];
  const re = /([MLCZ])([^MLCZ]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    const nums = m[2].trim() ? m[2].trim().split(/[\s,]+/).map(Number) : [];
    out.push({ c: m[1] as Seg["c"], p: nums });
  }
  return out;
}

export function mapSegs(segs: Seg[], f: (x: number, y: number) => Pt): Seg[] {
  return segs.map((s) => {
    const p: number[] = [];
    for (let i = 0; i < s.p.length; i += 2) p.push(...f(s.p[i], s.p[i + 1]));
    return { c: s.c, p };
  });
}

function boxOf(segs: Seg[]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  let cx = 0, cy = 0;
  for (const s of segs) {
    if (s.c === "M" || s.c === "L") { cx = s.p[0]; cy = s.p[1]; add(cx, cy); }
    else if (s.c === "C") {
      const [a, b, c, d, e, f] = s.p;
      for (let i = 1; i <= 24; i++) {
        const t = i / 24, u = 1 - t;
        add(u * u * u * cx + 3 * u * u * t * a + 3 * u * t * t * c + t * t * t * e, u * u * u * cy + 3 * u * u * t * b + 3 * u * t * t * d + t * t * t * f);
      }
      cx = e; cy = f;
    }
  }
  return [x0, y0, x1, y1];
}

export function readSvg(text: string): { items: Item[]; size: [number, number] } {
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(text);
  if (!vb) throw new Error("no viewBox");
  const glyphs = new Map<string, Seg[]>();
  for (const m of text.matchAll(/<g id="(glyph-[\d-]+)">\s*(?:<path d="([^"]*)"\s*\/>)?/g)) glyphs.set(m[1], parseD(m[2] ?? ""));
  const body = text.slice(text.indexOf("</defs>"));
  const items: Item[] = [];
  const re = /<path ([^>]*)\/>|<g fill="([^"]*)"[^>]*>\s*((?:<use [^>]*\/>\s*)+)<\/g>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m[1] !== undefined) {
      const attrs = m[1];
      const a = (n: string) => new RegExp(` ?${n}="([^"]*)"`).exec(" " + attrs)?.[1];
      let segs = parseD(a("d")!);
      const tr = a("transform");
      if (tr) {
        const t = /matrix\(([^)]*)\)/.exec(tr)![1].split(",").map(Number);
        segs = mapSegs(segs, (x, y) => [t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5]]);
      }
      items.push({
        segs,
        fill: colour(a("fill") ?? "none"),
        rule: a("fill-rule") === "evenodd" ? "evenodd" : "nonzero",
        stroke: a("stroke") ? colour(a("stroke")!) : null,
        strokeWidth: Number(a("stroke-width") ?? 0),
        box: boxOf(segs),
        glyph: false,
      });
    } else {
      const fill = colour(m[2]);
      for (const u of m[3].matchAll(/<use xlink:href="#(glyph-[\d-]+)" x="([-\d.]+)" y="([-\d.]+)"/g)) {
        const g = glyphs.get(u[1]);
        if (!g) throw new Error(`missing ${u[1]}`);
        const dx = Number(u[2]), dy = Number(u[3]);
        const segs = mapSegs(g, (x, y) => [x + dx, y + dy]);
        if (!segs.some((s) => s.p.length)) continue;
        items.push({ segs, fill, rule: "nonzero", stroke: null, strokeWidth: 0, box: boxOf(segs), glyph: true });
      }
    }
  }
  return { items, size: [Number(vb[1]), Number(vb[2])] };
}

/** True when the item's centre lies inside the rectangle. */
export function centreIn(i: Item, r: Box): boolean {
  const cx = (i.box[0] + i.box[2]) / 2, cy = (i.box[1] + i.box[3]) / 2;
  return cx >= r[0] && cx <= r[2] && cy >= r[1] && cy <= r[3];
}
