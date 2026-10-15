import { contrast } from "./brand.ts";

/**
 * The geometry and colours of BrandShield (components/BrandShield.tsx), kept free of React so a test can hold it. Units are the shield's own
 * (the viewBox of lib/brandShield.ts, 234.54 x 254.36). The safe areas were measured from the shield's body: its left and right edges at each height.
 */
export const SHIELD_BOX = { w: 234.54, h: 254.36 } as const;

/** Where content may go: `logo` an inscribed box for a picture (below the band, clear of the taper), `text` the widest stretch for a short word, `band` the strip on top. */
export const SAFE = {
  logo: { x: 75, y: 90, w: 85, h: 86 },
  text: { x: 58, y: 96, w: 119, h: 56 },
  band: { cx: 117.3, base: 56.5, w: 110, max: 18 },
} as const;

/** The plate that lifts a logo off the field: a disc inside the logo box, and the picture contained in the square that disc inscribes (with room). */
export const PLATE = { cx: 117.5, cy: 133, r: 44, side: 56 } as const;

export interface ShieldColours { rim: string; ring: string; field: string; ink: string }

/** The SPXN shield: navy rim and field, a white ring, white lettering. */
export const SPXN_SHIELD: ShieldColours = { rim: "#00274c", ring: "#ffffff", field: "#00274c", ink: "#ffffff" };

const hex = (h: string | null | undefined) => (h && /^[0-9a-f]{6}$/i.test(h) ? h.toLowerCase() : null);

/**
 * A team's shield: its primary colour for the rim and field; the ring in its secondary when that stands apart from the primary (2:1), else white;
 * the lettering in white or near-black, whichever reads better on the field. A team with no primary colour gets the SPXN shield.
 */
export function teamShield(primary: string | null | undefined, secondary: string | null | undefined): ShieldColours {
  const p = hex(primary);
  if (!p) return SPXN_SHIELD;
  const s = hex(secondary);
  const ring = s && contrast(s, p) >= 2 ? `#${s}` : "#ffffff";
  const ink = contrast("ffffff", p) >= contrast("111111", p) ? "#ffffff" : "#111111";
  return { rim: `#${p}`, ring, field: `#${p}`, ink };
}

/** Width of a capital in Barlow Condensed Bold, in ems (narrow I and 1, wide M and W, the rest alike), close enough to size a word to a box. */
export function wordWidth(text: string, spacing = 0): number {
  let w = 0;
  for (const ch of text) w += (/[I1]/.test(ch) ? 0.3 : /[MW]/.test(ch) ? 0.72 : /[.\-' ]/.test(ch) ? 0.28 : 0.52) + spacing;
  return w;
}

/** The font size that makes `text` fit `width`, never above `max`. */
export function fitSize(text: string, width: number, max: number, spacing = 0): number {
  const ems = wordWidth(text, spacing);
  return ems <= 0 ? max : Math.min(max, Math.floor((width / ems) * 10) / 10);
}
