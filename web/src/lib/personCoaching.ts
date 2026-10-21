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
const playoff = z.object({ league: z.string(), year: z.number(), franchise_id: z.number(), games: z.number(), w: z.number(), l: z.number(), t: z.number(), series_w: z.number(), series_l: z.number() });
const office = z.object({ league: z.string(), year: z.number(), franchise_id: z.number(), role: z.string(), position: z.string().nullable() });
const clubName = z.object({ year: z.number(), franchise_id: z.number(), team: z.string().nullable() });

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
  /** His playoff games and series over the seasons of the stint the archive attributes to him; null when it holds none. */
  playoffs: { games: number; w: number; l: number; t: number; seriesW: number; seriesL: number } | null;
}

/** A person's head-coach (baseball: manager) stints, oldest first. Empty for someone who never held the job, or while the archive has no staff rows. */
export const getPersonCoaching = cache(async (id: number): Promise<CoachStint[]> => {
  const mine = (await orElse(rows("team_season_staff", `person_id=eq.${id}&role=eq.head_coach&select=${FIELDS}&order=year`, staff), [])).filter((r) => isLeague(r.league));
  if (!mine.length) return [];
  // Every head coach of those club seasons, to tell the seasons he shared.
  const all = await rows("team_season_staff", `team_season_id=in.(${[...new Set(mine.map((r) => r.team_season_id))].join(",")})&role=eq.head_coach&select=${FIELDS}`, staff);
  const out: CoachStint[] = [];
  const po = await orElse(rows("coach_playoff_record", `person_id=eq.${id}&select=league,year,franchise_id,games,w,l,t,series_w,series_l&order=year`, playoff), []);
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
      const seen = po.filter((r) => r.league === lg && r.franchise_id === s.f && r.year >= s.a && r.year <= s.b);
      const playoffs = seen.length ? seen.reduce((n, r) => ({ games: n.games + r.games, w: n.w + r.w, l: n.l + r.l, t: n.t + r.t, seriesW: n.seriesW + r.series_w, seriesL: n.seriesL + r.series_l }), { games: 0, w: 0, l: 0, t: 0, seriesW: 0, seriesL: 0 }) : null;
      out.push({ league: lg, franchise: s.f, team: names[s.s], from: s.a, to: s.b, seasons: s.n, sole: s.sole, rec: s.rec, titles: years.filter((y) => won.has(`${s.f}:${y}`)), playoffs });
    }
  }
  return out.sort((a, b) => a.from - b.from || a.league.localeCompare(b.league));
});

/** One run of consecutive seasons in one front-office or assistant-coach job with a club. */
export interface StaffStint {
  league: string;
  franchise: number;
  team: string;
  role: string;
  position: string | null;
  from: number;
  to: number;
  seasons: number;
}

/** A person's general manager, president and assistant-coach stints, oldest first. Empty for someone who never held those jobs, or while the archive has none. */
export const getPersonStaff = cache(async (id: number): Promise<StaffStint[]> => {
  const mine = (await orElse(rows("person_staff", `person_id=eq.${id}&select=league,year,franchise_id,role,position&order=year`, office), [])).filter((r) => isLeague(r.league));
  const out: StaffStint[] = [];
  for (const lg of new Set(mine.map((r) => r.league))) {
    const here = mine.filter((r) => r.league === lg);
    const clubs = [...new Set(here.map((r) => r.franchise_id))];
    const names = new Map((await teamSeasonRows(`league=eq.${lg}&franchise_id=in.(${clubs.join(",")})&select=year,franchise_id,team`, clubName)).map((c) => [`${c.franchise_id}:${c.year}`, c.team ?? ""]));
    const jobs = new Map<string, typeof here>();
    for (const r of here) {
      const k = `${r.franchise_id}|${r.role}|${r.position ?? ""}`;
      jobs.set(k, [...(jobs.get(k) ?? []), r]);
    }
    for (const list of jobs.values()) {
      const years = [...new Set(list.map((r) => r.year))].sort((a, b) => a - b);
      let from = years[0];
      let seasons = 0;
      years.forEach((y, i) => {
        seasons++;
        if (years[i + 1] === y + 1) return;
        out.push({ league: lg, franchise: list[0].franchise_id, team: names.get(`${list[0].franchise_id}:${y}`) ?? "", role: list[0].role, position: list[0].position, from, to: y, seasons });
        from = years[i + 1];
        seasons = 0;
      });
    }
  }
  return out.sort((a, b) => a.from - b.from || a.league.localeCompare(b.league));
});
