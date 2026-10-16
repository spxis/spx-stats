import Link from "@/components/Link";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import { getPlayerPaths } from "@/lib/playerLinks";
import { showStat, STAT_GROUPS } from "@/lib/playerStats";
import { getRoster, type RosterPlayer } from "@/lib/roster";

/** The figures a club's players are led in on a game's page, by league: the kind of player and the statistic (a column of lib/playerStats). Leagues without player statistics have none. */
const LEADS: Record<string, { kind: RosterPlayer["kind"]; key: string }[]> = {
  nhl: [{ kind: "skater", key: "pts" }, { kind: "skater", key: "g" }, { kind: "goalie", key: "w" }],
  mlb: [{ kind: "batting", key: "hr" }, { kind: "batting", key: "rbi" }, { kind: "pitching", key: "w" }],
};

/**
 * A club's season leaders: the player ahead in each statistic of LEADS (the same roster the club's season page reads, so it is one cached answer for
 * both pages), with the number, each a link to the player. Nothing at all for a league or a club the archive holds no player statistics for.
 */
export async function GameLeaders({ lg, teamSeasonId }: { lg: string; teamSeasonId: number }) {
  const leads = LEADS[lg];
  if (!leads) return null;
  const roster = await getRoster(teamSeasonId);
  if (!roster.length) return null;
  const [{ say, fmt }, playerPath] = await Promise.all([currentSpeaker(), getPlayerPaths()]);
  const rows = leads.flatMap(({ kind, key }) => {
    const col = STAT_GROUPS[kind].cols.find((c) => c.key === key);
    if (!col) return [];
    let best: { p: RosterPlayer; v: number } | null = null;
    for (const p of roster) {
      if (p.kind !== kind) continue;
      const v = col.get(p.stats);
      if (v != null && v > 0 && (!best || v > best.v)) best = { p, v };
    }
    return best ? [{ col, ...best }] : [];
  });
  if (!rows.length) return null;
  return (
    <div className="gleaders">
      <span className="gl">{say("gm.leadersHead")}</span>
      <ul>
        {rows.map(({ col, p, v }) => (
          <li key={col.key + p.kind}>
            <span className="gv" title={say(col.title as PhraseKey)}>{say(col.label as PhraseKey)}</span>
            <Link href={playerPath(p.id, p.name, lg)} prefetch={false}>{p.name}</Link>
            <b>{showStat(col.kind, v, fmt)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
