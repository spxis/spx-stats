import "server-only";
import { cache } from "react";
import { z } from "zod";
import { ApiError, rows } from "./api/client";
import { leagueAwardSchema, personAwardSchema, personSchema, personTeamSchema, teamAwardSchema } from "./api/people";
import { personResumeSchema, personSeasonTeamSchema, personStatSchema, statReferenceSchema } from "./api/player";
import type { Phase, RefRow } from "./playerBoard";
import type { PersonResumeRow, PersonSeasonTeamRow, PersonStatRow } from "./api/player";
import type { LeagueAwardRow, PersonAwardRow, PersonRow, PersonTeamRow, TeamAwardRow } from "./api/people";
import { isLeague } from "./leagues";

export interface PersonData {
  person: PersonRow;
  awards: PersonAwardRow[];
  teams: PersonTeamRow[];
}

/** One person; null when there is no such person. A failed read throws ApiError. */
export const getPersonRow = cache(async (id: number): Promise<PersonRow | null> => (await rows("people", `person_id=eq.${id}&select=*`, personSchema))[0] ?? null);

/** The person whose record absorbed this one (a duplicate merged by db/build/185_person_merge.sql); null when the id was never merged or the view is missing. */
export const getRedirect = cache(async (oldId: number): Promise<number | null> => {
  try {
    const hit = (await rows("person_redirect", `old_person_id=eq.${oldId}&select=person_id`, z.object({ person_id: z.number() })))[0];
    return hit ? hit.person_id : null;
  } catch (e) {
    if (e instanceof ApiError) return null;
    throw e;
  }
});

/** One person with their awards and teams; null when there is no such person. A failed read throws ApiError. */
export const getPerson = cache(async (id: number): Promise<PersonData | null> => {
  const q = `person_id=eq.${id}`;
  const [person, awards, teams] = await Promise.all([
    getPersonRow(id),
    rows("person_awards", `${q}&select=*&order=year.desc,award`, personAwardSchema),
    rows("person_teams", `${q}&select=*&order=from_year`, personTeamSchema),
  ]);
  return person ? { person, awards, teams } : null;
});

/** Awards a franchise and its players won, newest first. A page does not fail because this view is empty or missing; null means the fetch failed. */
export const getTeamAwards = cache(async (lg: string, f: number): Promise<TeamAwardRow[] | null> => {
  if (!isLeague(lg)) return [];
  return rows("team_awards", `league=eq.${lg}&franchise_id=eq.${f}&select=*&order=year.desc,award_code`, teamAwardSchema).catch(() => null);
});

/** Every award of a league that is not the championship, for the awards-by-season table. */
export const getLeagueAwards = cache(async (lg: string): Promise<LeagueAwardRow[]> => {
  if (!isLeague(lg)) return [];
  return rows("awards", `league=eq.${lg}&kind=neq.championship&select=year,award_code,award,kind,winner,person_id,franchise_id&order=year.desc,award_code,winner`, leagueAwardSchema).catch(() => []);
});

export interface PlayerRecord {
  seasonTeams: PersonSeasonTeamRow[];
  stats: PersonStatRow[];
  resume: PersonResumeRow[];
}

/** A player's seasons, stats and resume (career totals are added up in the browser for the seasons shown). A page does not fail because these views are empty or not loaded yet. */
export const getPlayerRecord = cache(async (id: number): Promise<PlayerRecord> => {
  const q = `person_id=eq.${id}`;
  const [seasonTeams, stats, resume] = await Promise.all([
    rows("person_season_teams", `${q}&select=*&order=year,league`, personSeasonTeamSchema).catch(() => []),
    rows("person_stats", `${q}&select=*&order=year,league,stat_group`, personStatSchema).catch(() => []),
    rows("person_resume", `${q}&select=*&order=start_year.nullslast,name`, personResumeSchema).catch(() => []),
  ]);
  return { seasonTeams, stats, resume };
});

/**
 * The league around a player, per season (api.stat_reference): the rate figures of players of the same kind (`bucket`: forwards, defensemen or all)
 * and the best season totals of everyone. A page does not fail because the view is empty or not loaded yet: the board then leaves out the league
 * line, the ranks and the radar.
 */
export const getStatRefs = cache(async (league: string, group: string, bucket: string, from: number, to: number, phases: string): Promise<RefRow[]> => {
  if (!isLeague(league) || !/^[a-z]+$/.test(group) || !/^(all|F|D)$/.test(bucket) || !/^(regular|playoffs)(,playoffs)?$/.test(phases)) return [];
  const kinds = bucket === "all" ? "bucket=eq.all" : `or=(and(kind.eq.total,bucket.eq.all),and(kind.eq.rate,bucket.eq.${bucket}))`;
  const q = `league=eq.${league}&stat_group=eq.${group}&phase=in.(${phases})&year=gte.${from}&year=lte.${to}&${kinds}&select=stat_group,phase,metric,year,kind,n,avg,q,top&order=year`;
  const got = await rows("stat_reference", q, statReferenceSchema).catch(() => []);
  return got.map((r) => ({ g: r.stat_group, p: r.phase as Phase, m: r.metric, y: r.year, n: r.n,
    ...(r.kind === "rate" ? { a: r.avg ?? undefined, q: r.q ?? undefined } : { t: r.top ?? undefined }) }));
});
