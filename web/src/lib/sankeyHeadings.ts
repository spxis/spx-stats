/** A column heading is drawn 600 12px uppercase with .1em spacing (sankey.css): a Latin capital about 9.6px, a CJK character about 13px. */
const LATIN_W = 9.6, WIDE_W = 13;

/** The drawn width of a heading, in px (estimated: the page cannot be measured here). */
export function headingWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) >= 0x2e80 ? WIDE_W : LATIN_W;
  return w;
}

/** The heading cut to `width` px with an ellipsis when it is still too long. */
function cut(s: string, width: number): string {
  if (headingWidth(s) <= width) return s;
  let t = s;
  while (t.length > 1 && headingWidth(`${t}…`) > width) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** A column heading in at most two lines that each fit `width` px: whole words where they fit, the rest cut with an ellipsis. */
export function headingLines(s: string, width: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of s.split(" ")) {
    const next = cur ? `${cur} ${word}` : word;
    if (headingWidth(next) <= width) cur = next;
    else { if (cur) lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  const two = lines.length > 2 ? [lines[0], lines.slice(1).join(" ")] : lines;
  return two.map((l) => cut(l, width));
}
