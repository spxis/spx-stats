import type { Bracket } from "./bracketLayout";
import { buildBracket, type Tie } from "./bracketLayout";
import { drawKnockoutFiles, type KnockoutFiles, type KnockoutOptions } from "./bracketDraw";
import type { Speaker } from "./i18n/i18n";
import type { Match } from "./soccer";
import { soccerFlagAddress } from "./soccerFlagSprite";
import { SOCCER_LOOK, soccerAbbr } from "./soccerLook";
import { teamName } from "./soccerNames";
import { soccerMatchPath } from "./soccerPath";
import { knockoutOf, matchSides, soccerPlay } from "./soccerBracket";
import { stageName } from "./soccerView";
import { trophySvg } from "./trophies";

/**
 * A tournament's knockout as the bracket layout and the options Taisen draws it with, in one place for the tournament page (components/SoccerKnockout.tsx, which needs
 * the drawing's shape) and the file the page loads (app/bracket-svg, `soccerBracketFile`). Null when there are no knockout matches.
 */
export function soccerKnockoutDrawing(matches: readonly Match[], sp: Pick<Speaker, "say" | "locale">): { layout: Bracket; options: KnockoutOptions; ties: number } | null {
  const { say, locale } = sp;
  const ko = knockoutOf([...matches]);
  if (!ko.ties.length && !ko.third) return null;
  const league = matches[0]?.league ?? "worldcup";

  // The third-place match is a tie of its own for the drawing, after the others (it leads nowhere).
  const thirdTie: Tie<string> | null = ko.third
    ? { teams: matchSides(ko.third), winner: ko.third.winner_team_id, start: ko.third.match_date, third: true, play: soccerPlay([ko.third], matchSides(ko.third)[0]) }
    : null;
  const ties = [...ko.ties, ...(thirdTie ? [thirdTie] : [])];
  const matchOf = (i: number): Match => (i < ko.ties.length ? ko.ties[i].matches.at(-1)! : ko.third!);
  const sideOf = new Map<string, { m: Match; home: boolean }>();
  for (const m of [...matches].sort((x, y) => x.match_date.localeCompare(y.match_date))) {
    sideOf.set(m.home_team_id, { m, home: true });
    sideOf.set(m.away_team_id, { m, home: false });
  }
  const look = (id: string) => {
    const { m, home } = sideOf.get(id)!;
    const t = home ? { name: m.home, slug: m.home_slug, flag: m.home_flag } : { name: m.away, slug: m.away_slug, flag: m.away_flag };
    const colour = SOCCER_LOOK[id];
    return { name: teamName(t, locale), abbr: soccerAbbr(id, t.name), ...(t.flag ? { flag: t.flag } : {}), ...(colour ? { color: `#${colour[1]}` } : {}) };
  };
  const rounds = [...ko.round, ko.stages.length];
  const layout = buildBracket(ties, rounds, () => null, look);
  const options: KnockoutOptions = {
    locale, roundNames: ko.stages.map((s) => stageName(say, s)),
    flagHref: soccerFlagAddress,
    href: (t) => { const m = matchOf(t.index); return soccerMatchPath(m.year, m.match_id, m.home, m.away); },
    trophy: trophySvg(["worldcup", "wwc", "mls"].includes(league) ? league : "soccer"),
  };
  return { layout, options, ties: ties.length };
}

/** One part (`wide` or `phone`) of a tournament's knockout bracket, standing on its own, for the file /bracket-svg/soccer-<year>.<part>.<language>.svg. */
export function soccerBracketFile(matches: readonly Match[], sp: Pick<Speaker, "say" | "locale">, part: keyof KnockoutFiles): string | null {
  const d = soccerKnockoutDrawing(matches, sp);
  return d ? drawKnockoutFiles(d.layout, d.options)[part] : null;
}
