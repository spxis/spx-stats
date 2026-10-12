import Link from "next/link";
import { SortTable } from "@/components/SortTable";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import { getPlayerPaths } from "@/lib/playerLinks";
import { showStat, STAT_GROUPS } from "@/lib/playerStats";
import { getRoster, type RosterGroup, type RosterPlayer } from "@/lib/roster";
import { tableOf, type ColumnSpec } from "@/lib/sort";

/** The columns each kind of player shows, from lib/playerStats, and the order the table opens in. */
const SHOW = {
  skater: { keys: ["gp", "g", "a", "pts", "pm", "pim"], sort: "pts.desc" },
  goalie: { keys: ["gp", "gs", "w", "l", "t", "otl", "gaa", "svp", "so"], sort: "gp.desc" },
  batting: { keys: ["g", "ab", "r", "h", "hr", "rbi", "sb", "avg", "obp", "slg"], sort: "ab.desc" },
  pitching: { keys: ["w", "l", "era", "g", "gs", "sv", "ip", "so", "whip"], sort: "ip.desc" },
} as const;

const ORDER: RosterGroup[] = ["forwards", "defense", "skaters", "goalies", "batters", "pitchers"];
const TITLE: Record<RosterGroup, PhraseKey> = {
  forwards: "roster.forwards", defense: "roster.defense", skaters: "roster.skaters", goalies: "roster.goalies", batters: "roster.batters", pitchers: "roster.pitchers",
};

/** The players with statistics for a club's season, by position group; nothing at all when there are none. */
export async function TeamRoster({ lg, season, teamSeasonId }: { lg: string; season: string; teamSeasonId: number }) {
  const players = await getRoster(teamSeasonId);
  if (!players.length) return null;
  const { say, fmt } = await currentSpeaker();
  const playerPath = await getPlayerPaths();
  const blocks = ORDER.flatMap((g) => {
    const mine = players.filter((p) => p.group === g);
    return mine.length ? [{ g, mine }] : [];
  });
  return (
    <section className="section">
      <h2>{say("roster.title")}</h2>
      {blocks.map(({ g, mine }) => {
        const kind = mine[0].kind;
        const group = STAT_GROUPS[kind];
        const cols = SHOW[kind].keys.flatMap((k) => group.cols.filter((c) => c.key === k)).filter((c) => mine.some((p) => c.get(p.stats) != null));
        const hasPos = mine.some((p) => p.pos);
        const specs: ColumnSpec<RosterPlayer>[] = [
          { key: "player", label: say("roster.player"), cls: "team", get: (p) => p.name, cell: (p) => <Link href={playerPath(p.id, p.name, lg)} prefetch={false}>{p.name}</Link> },
          ...(hasPos ? [{ key: "pos", label: say("roster.pos"), get: (p) => p.pos } satisfies ColumnSpec<RosterPlayer>] : []),
          ...cols.map((c): ColumnSpec<RosterPlayer> => ({
            key: c.key, label: say(c.label as PhraseKey), title: say(c.title as PhraseKey), num: true,
            get: (p) => c.get(p.stats), cell: (p) => showStat(c.kind, c.get(p.stats), fmt),
          })),
        ];
        const table = tableOf(mine, specs, (p) => p.id);
        return (
          <div key={g} className="section">
            <h3>{say(TITLE[g], { n: mine.length })}</h3>
            <div className="tablebox"><SortTable {...table} param={`sort_${g}`} def={SHOW[kind].sort} /></div>
          </div>
        );
      })}
      <p className="note">{say("roster.note", { season })}</p>
    </section>
  );
}
