import { buildBracket, type Bracket } from "./bracketLayout";
import { drawBracket, type DrawOptions } from "@johnmorrisdotca/taisen-brackets";
import { knockoutScope, type KnockoutFiles, type KnockoutOptions } from "./bracketDraw";
import { knockoutDrawing, monogram, shapeOf, sideColours, type AllStarEvent, type AllStarGame } from "./allStarView";
import type { Speaker } from "./i18n/i18n";

/**
 * A tournament's knockout (the NHL's 3-on-3, the NBA's) as the layout and the options Taisen Brackets draws it with, in one place for the event page (which needs the
 * drawing's shape) and the file the page loads (app/bracket-svg, `allStarBracketFile`). The sides of a tournament are divisions or teams a captain picked, never clubs, so
 * each is a monogram on a colour (`sideColours`). Null when the games are not the semifinals and final of a bracket.
 */
export function allStarKnockout(games: readonly AllStarGame[], sp: Pick<Speaker, "say" | "locale">): { layout: Bracket; options: KnockoutOptions } | null {
  const d = knockoutDrawing(games);
  if (!d) return null;
  const hue = new Map(d.sides.map((n, i) => [n, sideColours(d.sides)[i]]));
  const look = (name: string) => ({ name, abbr: monogram(name), color: `#${hue.get(name) ?? "5d6874"}` });
  const layout = buildBracket(d.ties, d.round, () => null, look);
  const options: KnockoutOptions = { locale: sp.locale, roundNames: [sp.say("allstar.stage.semifinal"), sp.say("allstar.stage.final")] };
  return { layout, options };
}

/**
 * The two drawings of an All-Star bracket, each standing on its own. Four sides and three games do not fill the 1200 by 675 canvas of a season's bracket, so the desk's drawing
 * is as tall as its boxes need (the package's `height: null`, as the NBA's play-in is drawn).
 */
export function drawAllStarFiles(layout: Bracket, options: KnockoutOptions): KnockoutFiles {
  const base: DrawOptions = { look: "road", theme: "auto", styleScope: knockoutScope(options.layout), ...options };
  return { wide: drawBracket(layout, { ...base, size: { width: 1200, height: null } }), phone: drawBracket(layout, { ...base, size: "phone" }) };
}

/** The event of a calendar year that is drawn as a bracket (a year has one tournament), with its games. */
export function bracketEventOf(events: readonly AllStarEvent[], games: readonly AllStarGame[], year: number): AllStarGame[] | null {
  for (const ev of events.filter((e) => e.year === year).sort((a, b) => a.event_no - b.event_no)) {
    const mine = games.filter((g) => g.year === ev.year && g.event_no === ev.event_no);
    if (shapeOf(ev, mine) === "bracket") return mine;
  }
  return null;
}

/** One part (`wide` or `phone`) of an event's bracket, standing on its own, for the file /bracket-svg/allstar-<league>-<year>.<part>.<language>.svg. */
export function allStarBracketFile(games: readonly AllStarGame[], sp: Pick<Speaker, "say" | "locale">, part: keyof KnockoutFiles): string | null {
  const d = allStarKnockout(games, sp);
  return d ? drawAllStarFiles(d.layout, d.options)[part] : null;
}
