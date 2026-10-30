import "server-only";
import { cache } from "react";
import { z } from "zod";
import { ApiError, rows } from "./api/client";
import { canFallBack } from "./api/soften";
import type { StatNumbers } from "./api/player";
import { playerIndexSchema } from "./api/people";
import { championshipCounts } from "./playerTitles";
import { positionCode, positionCodes } from "./positions";
import { countedRoster } from "./titles";

const statSchema = z.object({ person_id: z.number(), stat_group: z.string(), games_played: z.number().nullable(), stats: z.record(z.string(), z.number()) });

const joinedSchema = z.object({
  person_id: z.number(), stat_group: z.string(), games_played: z.number().nullable(), stats: z.record(z.string(), z.number()),
  name: z.string(), position: z.string().nullable(), positions: z.array(z.string()).nullable(),
  nationality_code: z.string().nullable(), birth_country_code: z.string().nullable(), championship_count: z.number().nullable(),
});

const natSchema = z.object({
  person_id: z.number(), nationality_code: z.string().nullable(), birth_country_code: z.string().nullable(), championship_count: z.number(),
});

/** The tables a team's roster is drawn in. */
export type RosterGroup = "forwards" | "defense" | "goalies" | "skaters" | "batters" | "pitchers";

export interface RosterPlayer {
  id: number;
  name: string;
  /** The player's main position as short as it can be written, or null when the archive has none. */
  pos: string | null;
  /** Every position the player holds as codes, the main one first (api.player_index); the main one alone when no list is known. */
  positions: string[];
  /** The country code of the player's birthplace, else of his nationality (the same country api.player_index.country gives); null when neither is known. */
  nat: string | null;
  group: RosterGroup;
  /** The regular-season counting stats of the group's kind (skater, goalie, batting or pitching). */
  stats: StatNumbers;
  /** The statistic group the numbers belong to, to pick the columns. */
  kind: "skater" | "goalie" | "batting" | "pitching";
  /** Career championships (api.people.championship_count, the player page's total). Null when that count could not be read. */
  titles: number | null;
}

/** A position as the short code a table shows: its code; older words become their codes. */
const short = (p: string | null): string | null => (p && p.trim() ? positionCode(p) ?? p.trim() : null);

const FORWARD = new Set(["C", "LW", "RW", "W", "F"]);

/** A person's name and positions as the roster draws them (api.player_index), with his countries and career titles (api.people). */
interface Who { name: string; position: string | null; positions?: string[] | null }
interface Bio { nat: string | null; titles: number }

/**
 * The players with statistics for one club's season, under their names and positions from api.player_index. One request (api.team_season_player_stat, migration 169);
 * while that view is a 404, three: api.person_stats by team season, then api.player_index and api.people by the person ids. Empty when the archive holds no
 * player statistics for that club and year (every league but the NHL and MLB today) and when a read fails softly: the roster is an extra on the page, not a reason to lose it.
 */
export const getRoster = cache(async (teamSeasonId: number): Promise<RosterPlayer[]> => {
  try {
    let stats: { person_id: number; stat_group: string; games_played: number | null; stats: StatNumbers }[];
    let who: Map<number, Who>;
    let bio: Map<number, Bio>;
    let titlesKnown = true;
    try {
      const joined = await rows("team_season_player_stat", `team_season_id=eq.${teamSeasonId}&phase=eq.regular&select=person_id,stat_group,games_played,stats,name,position,positions,nationality_code,birth_country_code,championship_count`, joinedSchema);
      stats = joined;
      who = new Map(joined.map((p) => [p.person_id, p]));
      bio = new Map(joined.map((p) => [p.person_id, { nat: p.birth_country_code ?? p.nationality_code, titles: p.championship_count ?? 0 }]));
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 404) throw e;
      stats = await rows("person_stats", `team_season_id=eq.${teamSeasonId}&phase=eq.regular&select=person_id,stat_group,games_played,stats`, statSchema);
      if (!stats.length) return [];
      const ids = [...new Set(stats.map((s) => s.person_id))];
      who = new Map((await rows("player_index", `person_id=in.(${ids.join(",")})&select=person_id,name,position,positions,leagues,first_season,last_season,seasons_played,award_count`, playerIndexSchema)).map((p) => [p.person_id, p]));
      // championship_count is the player page's career total. A soft failure leaves the roster up and the Titles column off.
      const bios = await rows("people", `person_id=in.(${ids.join(",")})&select=person_id,nationality_code,birth_country_code,championship_count`, natSchema)
        .catch((err) => { if (!canFallBack(err)) throw err; return null; });
      bio = new Map((bios ?? []).map((n) => [n.person_id, { nat: n.birth_country_code ?? n.nationality_code, titles: n.championship_count }]));
      titlesKnown = bios != null;
    }
    if (!stats.length) return [];
    const ids = [...new Set(stats.map((s) => s.person_id))];
    const out: RosterPlayer[] = [];
    for (const id of ids) {
      const mine = stats.filter((s) => s.person_id === id);
      const p = who.get(id);
      if (!p) continue;
      const by = (g: string) => mine.find((s) => s.stat_group === g);
      const pitch = by("pitching"), bat = by("batting"), sk = by("skater"), gk = by("goalie");
      const pos = short(p.position);
      const positions = positionCodes(p.positions, p.position);
      let row: Pick<RosterPlayer, "kind" | "group" | "stats"> | null = null;
      if (gk && (!sk || (gk.games_played ?? 0) >= (sk.games_played ?? 0))) row = { kind: "goalie", group: "goalies", stats: gk.stats };
      else if (sk) row = { kind: "skater", group: pos === "D" ? "defense" : pos && FORWARD.has(pos) ? "forwards" : "skaters", stats: sk.stats };
      else if (pitch && (!bat || (pitch.games_played ?? 0) >= (bat.games_played ?? 0))) row = { kind: "pitching", group: "pitchers", stats: pitch.stats };
      else if (bat) row = { kind: "batting", group: "batters", stats: bat.stats };
      const b = bio.get(id);
      if (row) out.push({ id, name: p.name, pos, positions, nat: b?.nat?.toUpperCase() ?? null, titles: titlesKnown ? (b?.titles ?? 0) : null, ...row });
    }
    return out;
  } catch (e) {
    if (!canFallBack(e)) throw e;
    return [];
  }
});

const listSchema = z.object({
  person_id: z.number(), name: z.string(), position: z.string().nullable(), positions: z.array(z.string()).nullable(), country: z.string().nullable(),
  jersey_number: z.number().nullable(), status: z.string().nullable(),
});

/** The leagues whose rosters are archived as lists, without player statistics (NBA, CFL: Wikidata and Wikipedia; NFL: nflverse from 1973, Wikipedia before; AFL, AAFC: Wikipedia). */
const LISTED = new Set(["nba", "nfl", "cfl", "afl", "aafc"]);

/** A player on a club's season roster for a league with no player statistics. */
export interface ListedPlayer {
  id: number;
  name: string;
  /** The main position as a code, else null. */
  pos: string | null;
  /** Every position the player holds as codes, the main one first. */
  positions: string[];
  /** The country code of the birthplace, else of the nationality; null when neither is known. */
  nat: string | null;
  number: number | null;
  /** nflverse's roster status (ACT, RES, CUT, DEV ...), else null. */
  status: string | null;
  /** Career championships (api.people.championship_count). Null when that count could not be read. */
  titles: number | null;
}

/**
 * The players listed on one club's season (api.team_season_roster, migration 093) for a league whose rosters are loaded without statistics.
 * A second read brings each player's career championships from api.people. Empty for any other league (a few award winners' stints would be a
 * partial list), when nothing is listed and when the read fails softly.
 */
export const getTeamList = cache(async (league: string, teamSeasonId: number): Promise<ListedPlayer[]> => {
  if (!LISTED.has(league)) return [];
  try {
    const list = await rows("team_season_roster", `team_season_id=eq.${teamSeasonId}&select=person_id,name,position,positions,country,jersey_number,status`, listSchema);
    // The roster of the same season (a league with statistics and a list both) has most of these counts already: only the others are read.
    const known = new Map((await getRoster(teamSeasonId)).flatMap((p) => (p.titles == null ? [] : [[p.id, p.titles] as const])));
    const rest = list.map((p) => p.person_id).filter((id) => !known.has(id));
    const more = await championshipCounts(rest).catch((e) => { if (!canFallBack(e)) throw e; return null; });
    const titleOf = more ? new Map([...known, ...more]) : null;
    return list.map((p) => ({
      id: p.person_id, name: p.name, pos: short(p.position), positions: positionCodes(p.positions, p.position), nat: p.country?.toUpperCase() ?? null,
      number: p.jersey_number, status: p.status, titles: titleOf ? (titleOf.get(p.person_id) ?? 0) : null,
    }));
  } catch (e) {
    if (!canFallBack(e)) throw e;
    return [];
  }
});

/** The players the roster table draws for one club season, statistics first, else the listed roster without cuts and the practice squad. */
export const rosterShownPlayers = cache(async (league: string, teamSeasonId: number): Promise<Array<{ titles: number | null }>> => {
  const roster = await getRoster(teamSeasonId);
  if (roster.length) return countedRoster(roster);
  return countedRoster(await getTeamList(league, teamSeasonId));
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
    // A captain on the roster has a player page: the roster's own read of api.player_index says so, so only the others are looked up.
    const known = new Set((await getRoster(teamSeasonId)).map((p) => p.id));
    const ids = [...new Set(staff.filter((s) => s.kind === "player" && !known.has(s.person_id)).map((s) => s.person_id))];
    if (ids.length) for (const p of await rows("player_index", `person_id=in.(${ids.join(",")})&select=person_id,name,position,leagues,first_season,last_season,seasons_played,award_count`, playerIndexSchema)) known.add(p.person_id);
    return staff.map((s) => ({ role: s.role, id: known.has(s.person_id) ? s.person_id : null, name: s.name, firstOn: s.first_on, lastOn: s.last_on }));
  } catch (e) {
    if (!canFallBack(e)) throw e;
    return [];
  }
});
