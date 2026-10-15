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
export type KnockoutOptions = Pick<DrawOptions, "locale" | "roundNames" | "href" | "trophy" | "champion" | "highlightPath" | "thirdPlace" | "flagHref" | "tieClass" | "layout" | "headers" | "at" | "seeds" | "title">;

const SYMBOL = /<symbol id="([^"]+)"([^>]*)>([\s\S]*?)<\/symbol>/g;

/**
 * Each drawing writes every team's mark once, as a `<symbol>` (the package does that itself), and the two drawings of a bracket hold the same marks under
 * ids of their own. The phone's drops the symbols the desk's already holds and points at the desk's instead, so a mark's address is in the page once and not
 * twice (a `<use>` reads an id of the page wherever its drawing is). A symbol the desk's does not have stays in the phone's.
 */
export function shareMarks(wide: string, phone: string): string {
  const held = new Map<string, string>();
  for (const [, id, attrs, body] of wide.matchAll(SYMBOL)) held.set(attrs + body, id);
  let out = phone;
  for (const [whole, id, attrs, body] of phone.matchAll(SYMBOL)) {
    const same = held.get(attrs + body);
    if (!same) continue;
    out = out.replace(whole, "").split(`href="#${id}"`).join(`href="#${same}"`);
  }
  return out;
}

/**
 * The class that carries a bracket's rules (Taisen's `styleScope`): one per layout, since each layout has rules of its own. The desk's drawing writes the
 * stylesheet under it and the phone's, given the same class and `style: false`, leaves its copy out, so the page holds the rules once (a style element
 * applies whether or not the drawing around it is shown). Two layouts on one page (a play-in and a tree) each keep their own.
 */
export const knockoutScope = (layout: DrawOptions["layout"]): string => `kobk-${layout ?? "tree"}`;

export function drawKnockout(layout: BracketLayout, options: KnockoutOptions): Knockout {
  const base: DrawOptions = { look: "road", theme: "auto", styleScope: knockoutScope(options.layout), ...options };
  // The play-in is as tall as its games need; every other layout fills the 1200 by 675 canvas.
  const wide = drawBracket(layout, { ...base, size: options.layout === "playin" ? { width: 1200, height: null } : "wide" });
  return { wide, phone: shareMarks(wide, drawBracket(layout, { ...base, size: "phone", style: false })) };
}

/**
 * How a league's playoffs are drawn on a season page (the package's `layout`): the NHL's as rows (a name and a mark a line, the score at the end), the NFL's as
 * columns (tall slots and "AT": a one-game round, the visitor first), every other league's as the tree, in the road look. Each half carries its conference's
 * name over it where the data knows the halves.
 */
export function knockoutLook(lg: string): Pick<DrawOptions, "layout" | "headers" | "at"> {
  return { layout: lg === "nhl" ? "rows" : lg === "nfl" ? "columns" : "tree", headers: true, ...(lg === "nfl" ? { at: true } : {}) };
}
