/**
 * Where the players of one club's season came from and where they went: the pure part (no Next imports, so a node script can test it).
 * The rows are api.season_roster (a player on a club's season, with the first and last season the archive holds for him in the league).
 * Players are grouped by the club they were with the season before and the season after; those found on no roster fall into a group
 * that says why as far as the archive can tell (his first or last season it holds), else that the rosters it holds do not settle it.
 */

export interface RosterRow {
  franchise_id: number;
  person_id: number;
  name: string;
  position: string | null;
  games_played: number | null;
  first_season: number | null;
  last_season: number | null;
}

export interface FlowPlayer {
  id: number;
  name: string;
  position: string | null;
  games: number | null;
}

export type GroupKind = "club" | "first" | "last" | "absent" | "unknown";

export interface FlowGroup {
  key: string;
  kind: GroupKind;
  /** The franchise, for a club. */
  f?: number;
  players: FlowPlayer[];
}

export interface Flow {
  /** The club's players this season. */
  me: FlowPlayer[];
  /** Null when the archive holds no roster for that season, so the side is not drawn. */
  before: FlowGroup[] | null;
  after: FlowGroup[] | null;
  /** One entry per player and per pairing of his groups: where he was before and after (null on a side that is not drawn). */
  routes: { id: number; before: string | null; after: string | null }[];
}

export const clubKey = (f: number) => `club:${f}`;

export interface Side {
  rows: readonly RosterRow[];
  /** True when the archive holds the rosters of nearly every club that season, so a player on none of them was on no roster at all. */
  complete: boolean;
}

/** Whether `clubsWithRows` of `clubs` is nearly all of them. */
export const isComplete = (clubsWithRows: number, clubs: number): boolean => clubs > 0 && clubsWithRows >= Math.ceil(clubs * 0.8);

const asPlayer = (r: RosterRow): FlowPlayer => ({ id: r.person_id, name: r.name, position: r.position, games: r.games_played });

function classify(p: RosterRow, side: "before" | "after", year: number, other: readonly RosterRow[], complete: boolean): { key: string; kind: GroupKind; f?: number }[] {
  const clubs = [...new Set(other.filter((r) => r.person_id === p.person_id).map((r) => r.franchise_id))];
  if (clubs.length) return clubs.map((f) => ({ key: clubKey(f), kind: "club" as const, f }));
  if (side === "before" && p.first_season != null && p.first_season >= year) return [{ key: "first", kind: "first" }];
  if (side === "after" && p.last_season != null && p.last_season <= year) return [{ key: "last", kind: "last" }];
  return [complete ? { key: "absent", kind: "absent" } : { key: "unknown", kind: "unknown" }];
}

/** The flow in and out of the club `f` in `year`. `cur` is every club's roster that season; a side that is null is not drawn. */
export function rosterFlow(f: number, year: number, cur: readonly RosterRow[], before: Side | null, after: Side | null): Flow {
  const mine = new Map<number, RosterRow>();
  for (const r of cur) if (r.franchise_id === f && !mine.has(r.person_id)) mine.set(r.person_id, r);
  const groups = { before: new Map<string, FlowGroup>(), after: new Map<string, FlowGroup>() };
  const routes: Flow["routes"] = [];
  const place = (side: "before" | "after", s: Side | null, p: RosterRow): string[] | null => {
    if (!s) return null;
    const keys = classify(p, side, year, s.rows, s.complete);
    for (const k of keys) {
      const g = groups[side].get(k.key) ?? { key: k.key, kind: k.kind, f: k.f, players: [] };
      g.players.push(asPlayer(p));
      groups[side].set(k.key, g);
    }
    return keys.map((k) => k.key);
  };
  for (const p of mine.values()) {
    const b = place("before", before, p), a = place("after", after, p);
    for (const bk of b ?? [null]) for (const ak of a ?? [null]) routes.push({ id: p.person_id, before: bk, after: ak });
  }
  const order = (m: Map<string, FlowGroup>): FlowGroup[] =>
    [...m.values()].sort((x, y) => (x.kind === "club" ? 0 : 1) - (y.kind === "club" ? 0 : 1) || y.players.length - x.players.length || x.key.localeCompare(y.key));
  return { me: [...mine.values()].map(asPlayer), before: before ? order(groups.before) : null, after: after ? order(groups.after) : null, routes };
}
