import "server-only";
import { logoFor } from "./brand";
import { getBrands } from "./data";
import { buildTeamsWire, type TeamsWire } from "./worldLines";
import { stackSeries, tally, type FranchiseCount, type LeagueCount, type SeasonCount, type Stack } from "./countryModel";
import { flagCodes } from "./flagCodes";
import { getLeagueClubs } from "./teamSlugs";

/** The two long tables of a league's world page and the stack under its chart, worked out from the league's counts; the page and `/<league>/world/tables` both draw them. */
export async function worldTables(lg: string, seasonRows: SeasonCount[], leagueRows: LeagueCount[], franchiseRows: FranchiseCount[] | null): Promise<{ stack: Stack; flags: Record<string, true>; teams: TeamsWire }> {
  const ranked = tally(leagueRows.map((r) => [r.country, r.players] as [string, number])).list;
  const stack = stackSeries(seasonRows, ranked.slice(0, 6).map((c) => c.code));
  const flags = flagCodes(ranked.map((c) => c.code));
  const [clubList, brands] = await Promise.all([getLeagueClubs(lg), getBrands()]);
  const clubs = new Map(clubList.map((c) => [c.f, c.name]));
  const perClub = new Map<number, [string, number][]>();
  for (const r of franchiseRows ?? []) (perClub.get(r.franchise_id) ?? perClub.set(r.franchise_id, []).get(r.franchise_id)!).push([r.country, r.players]);
  const teams = [...perClub].flatMap(([f, list]) => {
    const t = tally(list);
    return t.known ? [{ f, name: clubs.get(f) ?? `#${f}`, t }] : [];
  });
  return { stack, flags, teams: buildTeamsWire(teams, (f) => logoFor(brands, f)) };
}
