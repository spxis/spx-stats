/**
 * Where a club stands in its season: its place in its division, conference and league, and its rank in the team stats the
 * season leaders page already works out. Pure, from the season's standings rows.
 */
import type { StandingRow } from "./api/types";
import { beats, cleanSeasons, scoreTeams, teamStatsFor, type TeamStat, type TeamStatId } from "./leaderStats";

export type RankPlace = { kind: "division" | "conference" | "league"; name: string };

export interface TeamRank {
  place: number;
  of: number;
  /** A division, conference or the league itself, or one of the leaders page's stats. */
  what: RankPlace | { kind: "stat"; stat: TeamStatId };
  /** The leaders page stat the rank links to. */
  link: TeamStatId;
}

export interface TeamRanks {
  /** Games the club has played: what an unfinished season's ranks are "through". */
  gp: number;
  progress: boolean;
  items: TeamRank[];
}

const tableOf = (rows: readonly StandingRow[]): StandingRow[] => {
  const seen = new Set<number>();
  return rows.filter((r) => (seen.has(r.team_id) ? false : (seen.add(r.team_id), true)));
};

/**
 * The club's ranks, or null when the season cannot be ranked (a fifth of its clubs are missing games, or the club played far
 * fewer than the rest). An unfinished season is ranked on per-game figures among every club, so clubs with different games
 * played compare fairly. `unfinished` says whether this season is still being played.
 */
export function teamRanks(standings: readonly StandingRow[], f: number, unfinished: boolean, leagueName: string): TeamRanks | null {
  const clean = cleanSeasons(standings, new Set(unfinished ? [standings[0]?.year ?? 0] : []));
  const year = standings[0]?.year;
  if (year == null || clean.issues.get(year) === "gaps") return null;
  const keep = new Set(clean.rows.map((r) => r.team_id));
  const rows = tableOf(standings.filter((r) => keep.has(r.team_id)));
  const me = rows.find((r) => r.franchise_id === f);
  if (!me || !me.gp) return null;

  const stats = teamStatsFor(rows);
  const byId = (id: TeamStatId) => stats.find((s) => s.id === id);
  const placeStat: TeamStat | undefined = rows.every((r) => r.pts != null) ? byId("pts") : byId("pct");
  const progress = unfinished;
  const items: TeamRank[] = [];

  if (placeStat) {
    const value = (r: StandingRow): number | null => {
      const v = placeStat.get(r);
      return v != null && progress && placeStat.id === "pts" && r.gp ? v / r.gp : v;
    };
    const place = (group: StandingRow[], what: RankPlace) => {
      const mine = value(me);
      if (mine == null || group.length < 2 || items.at(-1)?.of === group.length) return;
      const ahead = group.filter((r) => {
        const v = value(r);
        if (v == null || r.team_id === me.team_id) return false;
        if (beats(placeStat, v, mine)) return true;
        return v === mine && (r.w ?? 0) > (me.w ?? 0);
      }).length;
      items.push({ place: ahead + 1, of: group.length, what, link: placeStat.id });
    };
    const div = me.division_short ?? me.division;
    const conf = me.conference_short ?? me.conference;
    if (div) place(rows.filter((r) => r.division === me.division), { kind: "division", name: div });
    if (conf) place(rows.filter((r) => r.conference === me.conference), { kind: "conference", name: conf });
    if (div || conf || rows.length > 1) place(rows, { kind: "league", name: leagueName });
  }

  for (const id of ["pf", "pa", "diff"] as const) {
    const stat = byId(id);
    if (!stat || stat.get(me) == null) continue;
    const scored = scoreTeams(rows, stat);
    const mine = stat.get(me) as number;
    if (scored.length < 2) continue;
    items.push({ place: scored.filter((s) => beats(stat, s.value, mine)).length + 1, of: scored.length, what: { kind: "stat", stat: id }, link: id });
  }
  return items.length ? { gp: me.gp, progress, items } : null;
}
