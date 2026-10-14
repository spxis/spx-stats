import { drawBracket, type BracketLayout, type DrawOptions } from "@johnmorrisdotca/taisen-brackets";

/**
 * A knockout bracket drawn by Taisen Brackets (@johnmorrisdotca/taisen-brackets, MIT; credited in the page's credits) in its road look: large round marks, big
 * scores, the rounds on pills, a real link on every box. The package draws a picture of a fixed shape, so a page gets two of the same bracket, `wide`
 * (the halves meeting at the final, for a desk) and `phone` (the rounds as rows, 390 wide), and shows one of them (components/Knockout.tsx, knockout.css). The
 * drawings are plain SVG strings written into the page's HTML on the server: no script, no data fetched, and a kept page stays kept. Pure.
 */
export interface Knockout {
  wide: string;
  phone: string;
}

/** What the pages choose; the rest is the same everywhere. */
export type KnockoutOptions = Pick<DrawOptions, "locale" | "roundNames" | "href" | "trophy" | "champion" | "highlightPath" | "thirdPlace">;

const CLASS = /class="taisen (tb-[a-z0-9]+)/;
const STYLE = /<style>([\s\S]*?)<\/style>\n?/;

/**
 * Each drawing carries its own 9 KB stylesheet, scoped to a class of its own, and for one bracket the two are the same rules. The phone's drops its copy and
 * takes the desk's class, so the page holds the stylesheet once (a style element applies whether or not the drawing around it is shown). Left as it is when
 * the two stylesheets are not the same rules, as they would be if the package changed.
 */
export function shareStyle(wide: string, phone: string): string {
  const a = CLASS.exec(wide)?.[1], b = CLASS.exec(phone)?.[1];
  const styleA = STYLE.exec(wide)?.[1], styleB = STYLE.exec(phone)?.[1];
  if (!a || !b || styleA == null || styleB == null || styleA.split(a).join(b) !== styleB) return phone;
  return phone.replace(STYLE, "").replace(CLASS, `class="taisen $1 ${a}`);
}

export function drawKnockout(layout: BracketLayout, options: KnockoutOptions): Knockout {
  const base: DrawOptions = { look: "road", theme: "auto", ...options };
  const wide = drawBracket(layout, { ...base, size: "wide" });
  return { wide, phone: shareStyle(wide, drawBracket(layout, { ...base, size: "phone" })) };
}
