import "server-only";
import { ApiError } from "./api/client";
import { mayFallBack } from "./api/failure";
import { buildAwardGrid, type AwardGrid } from "./awardGrid";
import { logoFor } from "./brand";
import { buildChampLines, type ChampList } from "./champLines";
import { withCoverage } from "./coverage";
import { getBrands, getSummary } from "./data";
import { getLeagueAwards } from "./people";
import { getPlayerPaths } from "./playerLinks";
import { findFinal, pairSegment } from "./series";
import { getLeaguePlayoffTeams } from "./seriesData";
import { seasonPath } from "./slug";
import { franchiseOfName, getPaths } from "./teamSlugs";

/** The seasons of a league that have a champion, newest first, each with its champion's franchise filled in (found by name where the summary has none). */
export async function leagueChampions(lg: string) {
  const s = await getSummary();
  const list = withCoverage(s.seasons).filter((x) => x.league === lg && x.champion).sort((a, b) => b.year - a.year);
  return Promise.all(list.map(async (x) => (x.champion_franchise != null ? x : { ...x, champion_franchise: await franchiseOfName(lg, x.champion) })));
}

/**
 * A league's champions as plain data (lib/champLines.ts), newest first: each champion's name and logo, and its final with the score linked to the series page
 * and the opponent named, wherever the playoffs hold that series (the same finds components/ChampionNote.tsx makes for one season). A failed read of the
 * playoff games, outside production's transient failures, leaves the finals as plain notes.
 */
export async function leagueChampLines(lg: string): Promise<ChampList> {
  const [champs, brands, paths] = await Promise.all([leagueChampions(lg), getBrands(), getPaths()]);
  let games: Awaited<ReturnType<typeof getLeaguePlayoffTeams>> = [];
  if (champs.some((x) => x.champion_note)) {
    try { games = await getLeaguePlayoffTeams(lg); } catch (e) {
      if (!(e instanceof ApiError) || !mayFallBack(true, e, process.env.NODE_ENV)) throw e;
      console.error(e);
    }
  }
  const byYear = new Map<number, typeof games>();
  for (const g of games) { const l = byYear.get(g.year); if (l) l.push(g); else byYear.set(g.year, [g]); }
  return buildChampLines(champs, {
    logo: (f, year) => logoFor(brands, f, year),
    final: (year, champ, opponent) => {
      const found = findFinal(byYear.get(year) ?? [], champ, opponent);
      return found ? { opp: found.opp, href: `${seasonPath(lg, year)}/series/${pairSegment(paths, lg, year, champ, found.opp, found.meeting)}` } : null;
    },
  });
}

/** A league's awards by season as plain data (lib/awardGrid.ts); empty when the league has none. */
export async function leagueAwardGrid(lg: string): Promise<AwardGrid> {
  const [list, player, brands] = await Promise.all([getLeagueAwards(lg), getPlayerPaths(), getBrands()]);
  return buildAwardGrid(list, { player: (id, name) => player(id, name, lg), logo: (f, year) => logoFor(brands, f, year) });
}
