import { z } from "zod";
import type { StayRow } from "./cityModel.ts";

/**
 * The stays of every city as api.city_stay_pack gives them (migration 185): one row of plain arrays, each club's seasons there a flat list of numbers.
 * Read in one request in about 40 percent of the bytes of api.city_stay.
 */
const ints = z.array(z.number());

export const cityStayPackSchema = z.object({
  league: z.array(z.string()), franchise_id: ints, city_slug: z.array(z.string()), name: z.array(z.string()), first_year: ints, last_year: ints, active: z.array(z.boolean()),
  columns: ints, names_n: ints, runs_n: ints, seasons_n: ints, title_teams_n: ints,
  names: z.array(z.string()), runs: ints, seasons: ints, title_teams: z.array(z.string()),
});
export type CityStayPack = z.infer<typeof cityStayPackSchema>;

/** The rows of api.city_stay, in the order of league, franchise_id and city_slug. */
export function stayRowsFromPack(p: CityStayPack): StayRow[] {
  const n = p.league.length;
  for (const c of [p.franchise_id, p.city_slug, p.name, p.first_year, p.last_year, p.active, p.columns, p.names_n, p.runs_n, p.seasons_n, p.title_teams_n]) {
    if (c.length !== n) throw new Error("city_stay_pack: the columns are not the same length");
  }
  let nm = 0, rn = 0, sn = 0, tt = 0;
  const out: StayRow[] = [];
  for (let i = 0; i < n; i++) {
    const hasT = (p.columns[i]! & 1) === 1, hasO = (p.columns[i]! & 2) === 2;
    const stride = 3 + (hasT ? 1 : 0) + (hasO ? 1 : 0);
    const seasons = p.seasons.slice(sn, sn + p.seasons_n[i]!);
    if (seasons.length % stride) throw new Error(`city_stay_pack: seasons of stay ${i} are not a whole number of rows`);
    const rows: StayRow["rows"] = [];
    const titles: number[] = [];
    let year = p.first_year[i]!;
    for (let k = 0; k < seasons.length; k += stride) {
      const head = seasons[k]!;
      const champ = head % 2;
      year += (head - champ) / 2;
      let c = k + 3;
      rows.push([year, champ, seasons[k + 1]!, seasons[k + 2]!, hasT ? seasons[c++]! : 0, hasO ? seasons[c]! : 0]);
      if (champ) titles.push(year);
    }
    const runs: [number, number][] = [];
    const flat = p.runs.slice(rn, rn + p.runs_n[i]!);
    for (let k = 0; k + 1 < flat.length; k += 2) runs.push([flat[k]!, flat[k + 1]!]);
    const title_teams = p.title_teams.slice(tt, tt + p.title_teams_n[i]!);
    if (title_teams.length !== titles.length) throw new Error(`city_stay_pack: stay ${i} has ${titles.length} titles and ${title_teams.length} title names`);
    out.push({
      league: p.league[i]!, franchise_id: p.franchise_id[i]!, city_slug: p.city_slug[i]!, name: p.name[i]!, names: p.names.slice(nm, nm + p.names_n[i]!),
      first_year: p.first_year[i]!, last_year: p.last_year[i]!, active: p.active[i]!, runs, rows, title_teams,
    });
    nm += p.names_n[i]!; rn += p.runs_n[i]!; sn += p.seasons_n[i]!; tt += p.title_teams_n[i]!;
  }
  return out;
}
