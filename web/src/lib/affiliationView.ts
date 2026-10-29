import { z } from "zod";

/** One line of api.team_season_affiliation (migration 160): the NHL club(s) a minor-league club was affiliated with in a season. */
export const affiliationSchema = z.object({
  league: z.string(),
  year: z.number().int(),
  franchise_id: z.number().int(),
  position: z.number().int(),
  label: z.string(),
  parent_league: z.string().nullable(),
  parent_franchise_id: z.number().int().nullable(),
  team: z.string().nullable(),
  parent_team: z.string().nullable(),
});
export type Affiliation = z.infer<typeof affiliationSchema>;

/** A club (`lg`, `f`) over a run of consecutive seasons, under the name it had in the last of them. */
export interface Stay { lg: string; f: number; name: string; first: number; last: number }

/**
 * Seasons of the same club that follow one another are one stay: a season missing in between (a club that sat one out, the NHL's lost 2004-05) ends it.
 * `key` names the club a line is about and `name` its name that season; the stay carries the last name.
 */
function stays(items: { lg: string; f: number; name: string | null; year: number }[]): Stay[] {
  const by = new Map<string, { lg: string; f: number; name: string | null; year: number }[]>();
  for (const it of items) by.set(`${it.lg}|${it.f}`, [...(by.get(`${it.lg}|${it.f}`) ?? []), it]);
  const out: Stay[] = [];
  for (const list of by.values()) {
    list.sort((a, b) => a.year - b.year);
    let cur: Stay | null = null;
    for (const it of list) {
      if (cur && it.year <= cur.last + 1) { cur.last = Math.max(cur.last, it.year); cur.name = it.name ?? cur.name; }
      else { cur = { lg: it.lg, f: it.f, name: it.name ?? "", first: it.year, last: it.year }; out.push(cur); }
    }
  }
  return out;
}

/** The NHL clubs a minor-league club was affiliated with, one stay each, oldest first (a line whose code could not be placed with certainty has no club and is left out). */
export function parentStays(rows: readonly Affiliation[]): Stay[] {
  return stays(rows.flatMap((r) => (r.parent_franchise_id != null && r.parent_league ? [{ lg: r.parent_league, f: r.parent_franchise_id, name: r.parent_team, year: r.year }] : [])))
    .sort((a, b) => a.first - b.first || a.last - b.last || a.name.localeCompare(b.name, "en"));
}

/** The seasons a minor-league club was independent, as runs of consecutive seasons. */
export function independentRuns(rows: readonly Affiliation[]): { first: number; last: number }[] {
  return stays(rows.filter((r) => r.label === "independent").map((r) => ({ lg: r.league, f: r.franchise_id, name: null, year: r.year })))
    .map(({ first, last }) => ({ first, last }))
    .sort((a, b) => a.first - b.first);
}

/** The minor-league clubs that were affiliated with an NHL club, one stay each, the most recent first. */
export function farmStays(rows: readonly Affiliation[]): Stay[] {
  return stays(rows.map((r) => ({ lg: r.league, f: r.franchise_id, name: r.team, year: r.year })))
    .sort((a, b) => b.last - a.last || b.first - a.first || a.name.localeCompare(b.name, "en"));
}

/** The NHL clubs a club had in one season (one or two). */
export function parentsOfSeason(rows: readonly Affiliation[], year: number): { lg: string; f: number; name: string }[] {
  return rows.filter((r) => r.year === year && r.parent_franchise_id != null && r.parent_league)
    .sort((a, b) => a.position - b.position)
    .map((r) => ({ lg: r.parent_league!, f: r.parent_franchise_id!, name: r.parent_team ?? r.label }));
}
