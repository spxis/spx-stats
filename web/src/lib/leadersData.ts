import "server-only";
import { cache } from "react";
import { checkRows, countRows, rows } from "./api/client";
import { leagueStandings, standingRows } from "./api/teamSeasons";
import { leaderStandingSchema, leaderStatSchema, personNameSchema, type LeaderStat } from "./api/leaders";
import { isOutsideConference } from "./leagues";
import type { PlayerGroupId } from "./leaderPlayers";

/** Every standings row of a league, all seasons, trimmed to the columns the leaders use (a few pages, kept a day). */
export const getLeagueStandings = cache(async (lg: string) => {
  const packed = await leagueStandings(lg);
  const list = packed
    ? checkRows("standing_league_pack", packed, leaderStandingSchema)
    : await standingRows(`league=eq.${lg}&select=year,team_id,franchise_id,team,gp,w,l,t,otl,pts,pf,pa,conference&order=year,team_id`, leaderStandingSchema);
  return list.filter((r) => !isOutsideConference(lg, r.conference));
});

/** The regular-season counting stats of one stat group in a league season, a row for each club a player played for. The club's name is left out: asking the view for it is what makes it slow. */
export const getSeasonStats = cache(async (lg: string, y: number, group: PlayerGroupId): Promise<LeaderStat[]> =>
  rows("person_stats", `league=eq.${lg}&year=eq.${y}&phase=eq.regular&stat_group=eq.${group}&select=person_id,franchise_id,stat_group,stats&order=person_id,team_season_id`, leaderStatSchema));

/** The names of some people, by id. */
export const getNames = cache(async (ids: string): Promise<Map<number, string>> => {
  if (!ids) return new Map();
  const found = await rows("people", `person_id=in.(${ids})&select=person_id,name`, personNameSchema);
  return new Map(found.map((p) => [p.person_id, p.name]));
});

/**
 * How many club-seasons in the league's history beat a figure in one stat (regular season), so a leader's place on the
 * all-time list of single-season totals is this plus one. `key` and `group` come from the fixed list of leader stats, never from a request.
 */
export const getSeasonsBeating = cache(async (lg: string, group: PlayerGroupId, key: string, value: number): Promise<number> =>
  countRows("person_stats", `league=eq.${lg}&phase=eq.regular&stat_group=eq.${group}&stats->${key}=gt.${value}&select=person_id`));
