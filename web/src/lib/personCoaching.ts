import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";
import { orElse } from "./api/soften";
import { teamSeasonRows } from "./api/teamSeasons";
import { buildCareers, type Rec } from "./coachMoves";
import { isLeague } from "./leagues";

const staff = z.object({ team_season_id: z.number(), league: z.string(), year: z.number(), franchise_id: z.number(), person_id: z.number(), name: z.string(), first_on: z.string().nullable() });
const clubSeason = z.object({ year: z.number(), franchise_id: z.number(), team: z.string().nullable(), w: z.number().nullable(), l: z.number().nullable(), t: z.number().nullable(), otl: z.number().nullable(), champion: z.boolean().nullable() });
const FIELDS = "team_season_id,league,year,franchise_id,person_id,name,first_on";

/** Awards given to a coach or manager, shown under the coaching career. */
export const COACH_AWARDS = new Set(["nhl_jack_adams", "nba_coach_of_the_year", "mlb_manager_of_the_year"]);

/** One run of head-coach seasons with a club: the club's record over the seasons he was its only head coach, and the seasons it won the title. */
export interface CoachStint {
  league: string;
  franchise: number;
  team: string;
  from: number;
  to: number;
  seasons: number;
  sole: number;
  rec: Rec;
  titles: number[];
}

/** A person's head-coach (baseball: manager) stints, oldest first. Empty for someone who never held the job, or while the archive has no staff rows. */
export const getPersonCoaching = cache(async (id: number): Promise<CoachStint[]> => {
  const mine = (await orElse(rows("team_season_staff", `person_id=eq.${id}&role=eq.head_coach&select=${FIELDS}&order=year`, staff), [])).filter((r) => isLeague(r.league));
  if (!mine.length) return [];
  // Every head coach of those club seasons, to tell the seasons he shared.
  const all = await rows("team_season_staff", `team_season_id=in.(${[...new Set(mine.map((r) => r.team_season_id))].join(",")})&role=eq.head_coach&select=${FIELDS}`, staff);
  const out: CoachStint[] = [];
  for (const lg of new Set(mine.map((r) => r.league))) {
    const clubs = [...new Set(mine.filter((r) => r.league === lg).map((r) => r.franchise_id))];
    const club = await teamSeasonRows(`league=eq.${lg}&franchise_id=in.(${clubs.join(",")})&select=year,franchise_id,team,w,l,t,otl,champion`, clubSeason);
    const results = new Map<string, Rec>();
    const names: string[] = [""];
    const nameAt = new Map<string, number>();
    const won = new Set<string>();
    for (const s of club) {
      const k = `${s.franchise_id}:${s.year}`;
      results.set(k, { w: s.w ?? 0, l: s.l ?? 0, t: s.t ?? 0, otl: s.otl ?? 0 });
      nameAt.set(k, names.push(s.team ?? "") - 1);
      if (s.champion) won.add(k);
    }
    const career = buildCareers(all.filter((r) => r.league === lg), results, (f, y) => nameAt.get(`${f}:${y}`) ?? 0, () => null, 1).find((c) => c.id === id);
    for (const s of career?.stints ?? []) {
      const years = mine.filter((r) => r.league === lg && r.franchise_id === s.f && r.year >= s.a && r.year <= s.b).map((r) => r.year);
      out.push({ league: lg, franchise: s.f, team: names[s.s], from: s.a, to: s.b, seasons: s.n, sole: s.sole, rec: s.rec, titles: years.filter((y) => won.has(`${s.f}:${y}`)) });
    }
  }
  return out.sort((a, b) => a.from - b.from || a.league.localeCompare(b.league));
});
