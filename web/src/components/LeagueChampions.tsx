import { ChampionsTable } from "@/components/ChampionsTable";
import { ChampionRow } from "@/components/ChampionRow";
import { CHAMP_HEAD, champHead } from "@/lib/champLines";
import { championRow } from "@/lib/champions";
import { getBrands, getSummary } from "@/lib/data";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { leagueChampLines } from "@/lib/leagueTables";
import { withCoverage } from "@/lib/coverage";
import { guard } from "@/lib/loadGuard";
import { getPaths } from "@/lib/teamSlugs";

/**
 * A league's champions: the row of boxes (the latest, the most titles, the latest repeat) over the table of every season's champion. The league page carries
 * the newest seasons of the table and fetches the rest when asked (`full` draws every season, for the league's full list page).
 */
export const LeagueChampions = guard(async function LeagueChampions({ lg, full = false }: { lg: string; full?: boolean }) {
  const { say } = await currentSpeaker();
  const [s, brands, paths, list] = await Promise.all([getSummary(), getBrands(), getPaths(), leagueChampLines(lg)]);
  if (!list.lines.length) return <p className="note">{say("league.noChampions")}</p>;
  const seasons = withCoverage(s.seasons).filter((x) => x.league === lg).sort((a, b) => a.year - b.year);
  const withGames = new Set(seasons.filter((x) => x.games > 0).map((x) => x.year));
  const head = full ? list : champHead(list, CHAMP_HEAD);
  return (
    <>
      <ChampionRow lg={lg} boxes={championRow(seasons, lg)} brands={brands} paths={paths} withGames={withGames} />
      <div className="tablebox"><ChampionsTable lg={lg} head={head.lines} logos={head.logos} total={list.lines.length} /></div>
    </>
  );
});
