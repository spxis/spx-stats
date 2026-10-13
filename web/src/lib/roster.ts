import "server-only";
import { cache } from "react";
import { z } from "zod";
import { ApiError, rows } from "./api/client";
import type { StatNumbers } from "./api/player";
import { playerIndexSchema } from "./api/people";
import { positionCode } from "./positions";

const statSchema = z.object({ person_id: z.number(), stat_group: z.string(), games_played: z.number().nullable(), stats: z.record(z.string(), z.number()) });

const natSchema = z.object({ person_id: z.number(), nationality_code: z.string().nullable(), birth_country_code: z.string().nullable() });

/** The tables a team's roster is drawn in. */
export type RosterGroup = "forwards" | "defense" | "goalies" | "skaters" | "batters" | "pitchers";

export interface RosterPlayer {
  id: number;
  name: string;
  /** The player's main position as short as it can be written, or null when the archive has none. */
  pos: string | null;
  /** Every position the player holds, each as short as it can be written, joined with "/" ("P/DH"); the main one alone when no list is known. */
  allPos: string | null;
  /** The country code of the player's birthplace, else of his nationality (the same country api.player_index.country gives); null when neither is known. */
  nat: string | null;
  group: RosterGroup;
  /** The regular-season counting stats of the group's kind (skater, goalie, batting or pitching). */
  stats: StatNumbers;
  /** The statistic group the numbers belong to, to pick the columns. */
  kind: "skater" | "goalie" | "batting" | "pitching";
}

/** A position as the short code a table shows: its code; older words become their codes. */
const short = (p: string | null): string | null => (p && p.trim() ? positionCode(p) ?? p.trim() : null);

const FORWARD = new Set(["C", "LW", "RW", "W", "F"]);

/**
 * The players with statistics for one club's season (api.person_stats by team season), under their names and positions from api.player_index.
 * Two requests. Empty when the archive holds no player statistics for that club and year (every league but the NHL and MLB today) and
 * when either read fails: the roster is an extra on the page, not a reason to lose it.
 */
export const getRoster = cache(async (teamSeasonId: number): Promise<RosterPlayer[]> => {
  try {
    const stats = await rows("person_stats", `team_season_id=eq.${teamSeasonId}&phase=eq.regular&select=person_id,stat_group,games_played,stats`, statSchema);
    if (!stats.length) return [];
    const ids = [...new Set(stats.map((s) => s.person_id))];
    const people = new Map((await rows("player_index", `person_id=in.(${ids.join(",")})&select=person_id,name,position,positions,leagues,first_season,last_season,seasons_played,award_count`, playerIndexSchema)).map((p) => [p.person_id, p]));
    const nats = new Map((await rows("people", `person_id=in.(${ids.join(",")})&select=person_id,nationality_code,birth_country_code`, natSchema)
      .catch((e) => { if (!(e instanceof ApiError)) throw e; return []; })).map((n) => [n.person_id, n.birth_country_code ?? n.nationality_code]));
    const out: RosterPlayer[] = [];
    for (const id of ids) {
      const mine = stats.filter((s) => s.person_id === id);
      const p = people.get(id);
      if (!p) continue;
      const by = (g: string) => mine.find((s) => s.stat_group === g);
      const pitch = by("pitching"), bat = by("batting"), sk = by("skater"), gk = by("goalie");
      const pos = short(p.position);
      const allPos = [...new Set((p.positions?.length ? p.positions : [p.position]).map(short).filter((x): x is string => !!x))].join("/") || null;
      let row: Pick<RosterPlayer, "kind" | "group" | "stats"> | null = null;
      if (gk && (!sk || (gk.games_played ?? 0) >= (sk.games_played ?? 0))) row = { kind: "goalie", group: "goalies", stats: gk.stats };
      else if (sk) row = { kind: "skater", group: pos === "D" ? "defense" : pos && FORWARD.has(pos) ? "forwards" : "skaters", stats: sk.stats };
      else if (pitch && (!bat || (pitch.games_played ?? 0) >= (bat.games_played ?? 0))) row = { kind: "pitching", group: "pitchers", stats: pitch.stats };
      else if (bat) row = { kind: "batting", group: "batters", stats: bat.stats };
      if (row) out.push({ id, name: p.name, pos, allPos, nat: nats.get(id)?.toUpperCase() ?? null, ...row });
    }
    return out;
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return [];
  }
});

const staffSchema = z.object({
  role: z.enum(["head_coach", "captain", "alternate_captain"]), person_id: z.number(), name: z.string(), kind: z.string(),
  first_on: z.string().nullable(), last_on: z.string().nullable(),
});

export interface StaffMember {
  role: "head_coach" | "captain" | "alternate_captain";
  /** Set when the person has a player page. */
  id: number | null;
  name: string;
  firstOn: string | null;
  lastOn: string | null;
}

/** The head coaches (managers in baseball), captains and alternate captains of a club's season; empty when the archive holds none or cannot be read. */
export const getStaff = cache(async (teamSeasonId: number): Promise<StaffMember[]> => {
  try {
    const staff = await rows("team_season_staff", `team_season_id=eq.${teamSeasonId}&select=role,person_id,name,kind,first_on,last_on&order=ord`, staffSchema);
    const ids = [...new Set(staff.filter((s) => s.kind === "player").map((s) => s.person_id))];
    const known = ids.length
      ? new Set((await rows("player_index", `person_id=in.(${ids.join(",")})&select=person_id,name,position,leagues,first_season,last_season,seasons_played,award_count`, playerIndexSchema)).map((p) => p.person_id))
      : new Set<number>();
    return staff.map((s) => ({ role: s.role, id: known.has(s.person_id) ? s.person_id : null, name: s.name, firstOn: s.first_on, lastOn: s.last_on }));
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return [];
  }
});
