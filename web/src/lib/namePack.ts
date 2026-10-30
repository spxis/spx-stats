import { z } from "zod";
import type { FranchiseNameRow } from "./api/types.ts";
import type { NameRun } from "./seasonRuns.ts";

/**
 * The names every club wore and its runs of seasons under one name, as api.franchise_name_pack gives them (migration 177): one row for each club
 * in each league. Read in one request instead of the four that api.franchise_names and api.team_season_name_run took, whole.
 */
const strN = z.string().nullable();

export const namePackSchema = z.object({
  league: z.string(),
  franchise_id: z.number(),
  names: z.array(z.tuple([z.string(), strN, strN])),
  runs: z.array(z.tuple([strN, z.number(), z.number()])),
});
export type NamePackRow = z.infer<typeof namePackSchema>;

/**
 * The rows of api.franchise_names by league, franchise, then name_from (no date last), name_to and name: the pack's own order. With `datelessFirst`
 * the rows with no start date come first of each club, as `name_from.nullsfirst` asks for.
 */
export function nameRowsFromPack(packs: readonly NamePackRow[], datelessFirst = false): FranchiseNameRow[] {
  const out: FranchiseNameRow[] = [];
  for (const p of packs) {
    const rows = p.names.map((n): FranchiseNameRow => ({ league: p.league, franchise_id: p.franchise_id, name: n[0], name_from: n[1], name_to: n[2] }));
    out.push(...(datelessFirst ? [...rows.filter((r) => r.name_from == null), ...rows.filter((r) => r.name_from != null)] : rows));
  }
  return out;
}

/** The rows of api.team_season_name_run, by league, franchise and first year. */
export function runsFromPack(packs: readonly NamePackRow[]): NameRun[] {
  const out: NameRun[] = [];
  for (const p of packs) for (const r of p.runs) out.push({ league: p.league, franchise_id: p.franchise_id, team: r[0], from_year: r[1], to_year: r[2] });
  return out;
}
