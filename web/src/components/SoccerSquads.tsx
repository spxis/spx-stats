import { LazySquad } from "@/components/LazySquad";
import type { PositionBook } from "@/components/PositionKey";
import { SoccerTeamName } from "@/components/SoccerTeamName";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { Speaker } from "@/lib/i18n/i18n";
import type { Squad } from "@/lib/soccer";
import { squadCodes, type SquadLabels } from "@/lib/soccerSquad";

/** The column heads of a squad table in the speaker's language. */
export const squadLabels = (say: Speaker["say"]): SquadLabels => ({
  no: say("wc.col.no"), player: say("wc.col.player"), position: say("wc.col.position"), played: say("wc.col.played"),
  started: say("wc.col.started"), goals: say("wc.col.goals"), yellow: say("wc.col.yellow"), red: say("wc.col.red"),
});

/**
 * One closed list per team of a tournament. A list holds only the team's name: its squad (shirt number, player, position, matches played, started,
 * goals, cards) is loaded when the list is opened (LazySquad, from /worldcup/<year>/squad/<team>/rows), and without script it links to the squad's
 * page. `flags` maps a team id to its flag code. The positions the squads use are noted for the page's key, which they are not drawn through here.
 */
export async function SoccerSquads({ squads, flags, book }: { squads: Squad[]; flags: Map<string, string | null>; book: PositionBook }) {
  const { say } = await currentSpeaker();
  const teams = [...new Map(squads.map((s) => [s.team_id, s])).values()];
  for (const code of squadCodes(squads)) book.note(null, code, ["soccer"]);
  const texts = { loading: say("wc.squad.loading"), failed: say("wc.squad.failed"), open: say("wc.squad.open") };
  const labels = squadLabels(say);
  return (
    <>
      {teams.map((tm) => (
        <LazySquad key={tm.team_id} year={tm.year} slug={tm.team_slug} labels={labels} texts={texts}>
          <SoccerTeamName slug={tm.team_slug} name={tm.team} flag={flags.get(tm.team_id)} link={false} />
        </LazySquad>
      ))}
    </>
  );
}
