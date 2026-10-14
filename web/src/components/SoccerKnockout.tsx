import { Credits } from "@/components/Credits";
import { Knockout } from "@/components/Knockout";
import { drawKnockout } from "@/lib/bracketDraw";
import { buildBracket, type Tie } from "@/lib/bracketLayout";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { Match } from "@/lib/soccer";
import { soccerFlagAddress } from "@/lib/soccerFlagSprite";
import { SOCCER_LOOK, soccerAbbr } from "@/lib/soccerLook";
import { teamName } from "@/lib/soccerNames";
import { soccerMatchPath } from "@/lib/soccerPath";
import { knockoutOf, soccerPlay } from "@/lib/soccerBracket";
import { stageName } from "@/lib/soccerView";
import { trophySvg } from "@/lib/trophies";
import "./soccer.css";

/**
 * The knockout rounds as a bracket drawn by Taisen Brackets (lib/bracketDraw.ts, components/Knockout.tsx; layout in lib/bracketLayout.ts, ties from
 * lib/soccerBracket.ts): one half down each side or, on a phone, the rounds as rows, the final in the middle with the champion and the cup above it, a line
 * from each match to the one its winner plays next, the third-place match below. Each box shows both teams' round flags (the site's flag files, so a page
 * does not carry Spain's 80 KB coat of arms twice), names and goals, with the penalties in brackets and a note for extra time or a replay, and opens the match
 * (a replayed tie opens the replay). Any match the tree has no place for the package draws apart, with a heading.
 *
 * Under it the tournament page draws the two finalists' roads, with the package's `roadToFinal` (components/SoccerRoad.tsx, from the same matches).
 */
export async function SoccerKnockout({ matches }: { matches: Match[] }) {
  const { say, locale } = await currentSpeaker();
  const ko = knockoutOf(matches);
  if (!ko.ties.length && !ko.third) return null;
  const league = matches[0]?.league ?? "worldcup";

  // The third-place match is a tie of its own for the drawing, after the others (it leads nowhere).
  const thirdTie: Tie<string> | null = ko.third
    ? { teams: [ko.third.home_team_id, ko.third.away_team_id], winner: ko.third.winner_team_id, start: ko.third.match_date, third: true, play: soccerPlay([ko.third], ko.third.home_team_id) }
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
    const mark = soccerFlagAddress(t.flag), colour = SOCCER_LOOK[id];
    return { name: teamName(t, locale), abbr: soccerAbbr(id, t.name), ...(mark ? { mark } : {}), ...(colour ? { color: `#${colour[1]}` } : {}) };
  };
  const rounds = [...ko.round, ko.stages.length];
  const layout = buildBracket(ties, rounds, () => null, look);
  const art = drawKnockout(layout, {
    locale, roundNames: ko.stages.map((s) => stageName(say, s)),
    href: (t) => { const m = matchOf(t.index); return soccerMatchPath(m.year, m.match_id, m.home, m.away); },
    trophy: trophySvg(["worldcup", "wwc", "mls"].includes(league) ? league : "soccer"),
  });
  return (
    <>
      {ties.length ? <Knockout art={art} /> : null}
      {ties.length ? <p className="note"><Credits say={say} use={["brackets"]} /></p> : null}
    </>
  );
}
