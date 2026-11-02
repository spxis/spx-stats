import type { PositionBook } from "@/components/PositionKey";
import { SquadPicker, type PickerTeam } from "@/components/SquadPicker";
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
 * The squads of a tournament as a grid of its teams with the chosen team's squad under it (SquadPicker). A team is only a short line here: its squad (shirt number,
 * player, position, matches played, started, goals, cards) is loaded when it is chosen, from /worldcup/<year>/squad/<team>/rows, and without script each team links to the
 * squad's page. `flags` maps a team id to its flag code, `anchors` a team id to the fragment that names it (`squad-<code>`, from lib/soccerStrip.ts). The positions the
 * squads use are noted for the page's key, which they are not drawn through here.
 */
export async function SoccerSquads({ squads, flags, book, anchors, title }: { squads: Squad[]; flags: Map<string, string | null>; book: PositionBook; anchors?: Map<string, string>; title: string }) {
  const { say } = await currentSpeaker();
  const list = [...new Map(squads.map((s) => [s.team_id, s])).values()];
  for (const code of squadCodes(squads)) book.note(null, code, ["soccer"]);
  const texts = { loading: say("wc.squad.loading"), failed: say("wc.squad.failed"), open: say("wc.squad.open"), choose: say("wc.squad.choose"), aria: say("wc.squad.aria", { title }) };
  const picks: PickerTeam[] = list.map((tm) => [anchors?.get(tm.team_id) ?? `squad-${tm.team_slug}`, tm.team_slug, tm.team, flags.get(tm.team_id) ?? null]);
  return <SquadPicker year={list[0].year} teams={picks} labels={squadLabels(say)} texts={texts} />;
}
