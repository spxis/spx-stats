/**
 * What a donut writes in its middle: the whole at rest (a big figure and a small caption), and, while a slice is under the pointer or the focus,
 * that slice's own figures (its count big, then its name, then its share of the whole). Pure, so a node script can test it.
 */

/** The slice a reader is on. */
export interface CentreItem { label: string; n: number }

/** The resting middle: for example "15" and "players". */
export interface CentreRest { big: string; sub: string }

export interface CentreText {
  /** True while a slice is shown instead of the whole. */
  live: boolean;
  big: string;
  /** The small lines under the big figure: one at rest, two (name, then share) while a slice is shown. */
  lines: string[];
}

/** The text for the middle: the slice's figures when there is one (and the whole is not empty), else the resting text. */
export function centreText(
  rest: CentreRest,
  item: CentreItem | null | undefined,
  total: number,
  fmt: (n: number) => string,
  pct: (share: number) => string,
  of: (vars: { total: string; pct: string }) => string,
): CentreText {
  if (!item || !(total > 0)) return { live: false, big: rest.big, lines: [rest.sub] };
  return { live: true, big: fmt(item.n), lines: [item.label, of({ total: fmt(total), pct: pct(item.n / total) })] };
}

/** About how wide a small line draws (SVG user units, the donut's 200-unit box), counting a wide (Japanese) glyph as more than a Latin capital. */
export function lineWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += (ch.codePointAt(0) ?? 0) >= 0x2e80 ? 11 : 7.8;
  return w;
}

/** The width to squeeze a small line to so it stays inside the donut's hole, or undefined when it fits as it is. */
export function fitLength(text: string, max: number): number | undefined {
  return lineWidth(text) > max ? max : undefined;
}
