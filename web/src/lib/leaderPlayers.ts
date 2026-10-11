/**
 * Player leaders of one league season from the club-season counting stats. A player on more than one club is added up;
 * rates (average, ERA, goals against, save percentage) are worked out from the sums and need a minimum workload.
 */
import type { LeaderStat } from "./api/leaders";
import { STAT_GROUPS, type StatCol } from "./playerStats";

export type PlayerGroupId = "skater" | "goalie" | "batting" | "pitching";

export interface PlayerSpec {
  id: string;
  group: PlayerGroupId;
  col: StatCol;
  better: "high" | "low";
  /** A rate has to be earned over a minimum workload; a counting stat is ranked all-time by its key in the stats. */
  rate: boolean;
}

const col = (g: PlayerGroupId, key: string): StatCol => {
  const c = STAT_GROUPS[g].cols.find((x) => x.key === key);
  if (!c) throw new Error(`no ${g} column ${key}`);
  return c;
};
const count = (id: string, g: PlayerGroupId, key = id): PlayerSpec => ({ id, group: g, col: col(g, key), better: "high", rate: false });
const rate = (id: string, g: PlayerGroupId, better: "high" | "low" = "high"): PlayerSpec => ({ id, group: g, col: col(g, id), better, rate: true });

/** The statistics each league lists leaders for, in the order they are drawn. Baseball's strikeouts are `k` (the key is `so`). */
export const PLAYER_SPECS: Record<string, PlayerSpec[]> = {
  nhl: [
    count("pts", "skater"), count("g", "skater"), count("a", "skater"), count("pm", "skater"), count("pim", "skater"),
    count("w", "goalie"), count("so", "goalie"), rate("gaa", "goalie", "low"), rate("svp", "goalie"),
  ],
  mlb: [
    rate("avg", "batting"), count("hr", "batting"), count("rbi", "batting"), count("h", "batting"), count("r", "batting"), count("sb", "batting"),
    count("bb", "batting"), rate("obp", "batting"), rate("slg", "batting"),
    count("w", "pitching"), count("k", "pitching", "so"), count("sv", "pitching"), rate("era", "pitching", "low"), rate("whip", "pitching", "low"),
  ],
};

/** The groups of a league, in the order they are drawn, with the specs of each. */
export function groupsOf(specs: readonly PlayerSpec[]): { group: PlayerGroupId; specs: PlayerSpec[] }[] {
  const out: { group: PlayerGroupId; specs: PlayerSpec[] }[] = [];
  for (const s of specs) {
    const g = out.find((x) => x.group === s.group);
    if (g) g.specs.push(s); else out.push({ group: s.group, specs: [s] });
  }
  return out;
}

export interface PlayerSeason {
  id: number;
  stats: Record<string, number>;
  /** The clubs, the one with most games first. */
  clubs: { f: number; gp: number }[];
}

const gamesOf = (s: Record<string, number>): number => s.gp ?? s.g ?? 0;

/** One entry for each player of a stat group: the counting stats of all their clubs added up. */
export function aggregate(rows: readonly LeaderStat[], group: PlayerGroupId): PlayerSeason[] {
  const by = new Map<number, PlayerSeason>();
  for (const r of rows) {
    if (r.stat_group !== group) continue;
    let p = by.get(r.person_id);
    if (!p) by.set(r.person_id, (p = { id: r.person_id, stats: {}, clubs: [] }));
    for (const [k, v] of Object.entries(r.stats)) p.stats[k] = (p.stats[k] ?? 0) + v;
    p.clubs.push({ f: r.franchise_id, gp: gamesOf(r.stats) });
  }
  for (const p of by.values()) p.clubs.sort((a, b) => b.gp - a.gp);
  return [...by.values()];
}

/** The games a typical club played (the middle of the standings), which sets the minimum workload of the rates. */
export function clubGames(gp: readonly (number | null)[]): number {
  const g = gp.filter((x): x is number => x != null && x > 0).sort((a, b) => a - b);
  return g.length ? g[Math.floor(g.length / 2)] : 0;
}

const n = (s: Record<string, number>, k: string): number => s[k] ?? 0;

/** Whether a player has played enough to be ranked on a rate: 3.1 plate appearances or one inning for each club game; 30% of a club's games in goal. */
export function qualifies(spec: PlayerSpec, s: Record<string, number>, games: number): boolean {
  if (!spec.rate) return true;
  if (spec.group === "batting") return n(s, "ab") + n(s, "bb") + n(s, "hbp") + n(s, "sf") + n(s, "sh") >= 3.1 * games;
  if (spec.group === "pitching") return n(s, "ipouts") >= 3 * games;
  return gamesOf(s) >= 0.3 * games;
}

export interface RankedPlayer { player: PlayerSeason; value: number; rank: number }

/** The best `limit` players for a stat (ties share a rank). A counting stat of zero, or a rate nobody qualified for, is no leader. */
export function topPlayers(players: readonly PlayerSeason[], spec: PlayerSpec, games: number, limit = 10): RankedPlayer[] {
  const scored: { player: PlayerSeason; value: number }[] = [];
  for (const player of players) {
    if (!qualifies(spec, player.stats, games)) continue;
    const value = spec.col.get(player.stats);
    if (value == null || !Number.isFinite(value) || (!spec.rate && value <= 0)) continue;
    scored.push({ player, value });
  }
  scored.sort((a, b) => (spec.better === "high" ? b.value - a.value : a.value - b.value) || gamesOf(b.player.stats) - gamesOf(a.player.stats) || a.player.id - b.player.id);
  const out: RankedPlayer[] = [];
  scored.slice(0, limit).forEach((s, i) => {
    out.push({ ...s, rank: i > 0 && out[i - 1].value === s.value ? out[i - 1].rank : i + 1 });
  });
  return out;
}

/** The league figure of a rate over every player who qualified, e.g. batting average as total hits over total at bats. */
export function leagueRate(players: readonly PlayerSeason[], spec: PlayerSpec): number | null {
  const total: Record<string, number> = {};
  for (const p of players) for (const [k, v] of Object.entries(p.stats)) total[k] = (total[k] ?? 0) + v;
  const v = spec.col.get(total);
  return v != null && Number.isFinite(v) ? v : null;
}

/** How wide a bar is, 0 to 1, for a value among a list ranked best first. A count is drawn from zero; a rate between the last place shown and the best. */
export function barShare(spec: PlayerSpec, value: number, best: number, last: number): number {
  if (!spec.rate) return best > 0 ? Math.max(0.02, value / best) : 0;
  if (best === last) return 1;
  return 0.16 + 0.84 * ((value - last) / (best - last));
}
