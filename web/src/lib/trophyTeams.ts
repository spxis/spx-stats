import { holders, streaks, tally, leagueOfCode, type TrophyInfo, type TrophyRow } from "./awardTrophy.ts";
import { logoFor, type BrandMap } from "./brand.ts";
import { logoKey } from "./logoFit.ts";

/**
 * The clubs and logos that the winners drawn on the all-leagues trophies page name as a team (the holders on the cards, the clubs board and the runs board of
 * components/TrophyBlocks.tsx), as "league:franchise" and logo keys, so the page carries the team addresses and logo fits of those and not of every club of every league.
 * A winner who is a person is a link to their page and names no team.
 */
export function trophyTeams(infos: readonly TrophyInfo[], rows: readonly TrophyRow[], brands: BrandMap, size = 10): { teams: Set<string>; logos: Set<string> } {
  const teams = new Set<string>();
  const logos = new Set<string>();
  const add = (league: string, f: number | null, year: number) => {
    if (f == null) return;
    teams.add(`${league}:${f}`);
    const key = logoKey(logoFor(brands, f, year));
    if (key) logos.add(key);
  };
  const held = holders(rows);
  for (const t of infos) for (const r of (held.get(t.code)?.rows ?? []).slice(0, 3)) if (r.person_id == null) add(leagueOfCode(t.code), r.franchise_id, r.year);
  for (const c of tally(rows.filter((r) => r.kind === "championship" && r.franchise_id != null)).slice(0, size)) add(c.league, c.franchise_id, c.last);
  for (const s of streaks(rows).slice(0, size)) if (s.person_id == null) add(s.league, s.franchise_id, s.to);
  return { teams, logos };
}
