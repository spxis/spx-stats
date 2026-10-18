import { AwardsGrid } from "@/components/AwardsGrid";
import { CupSprite } from "@/components/CupSprite";
import { AWARD_GRID_HEAD, awardHead } from "@/lib/awardGrid";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { leagueAwardGrid } from "@/lib/leagueTables";
import "@/components/people.css";
import { guard } from "@/lib/loadGuard";

/**
 * Every award by season: a row a season, a column an award, a cell its winners (or how many, where there are many). The league page carries the newest
 * seasons and fetches the rest when asked (a "Show all" that is a link to the league's full grid, `full`, where script is off).
 */
export const LeagueAwards = guard(async function LeagueAwards({ lg, full = false }: { lg: string; full?: boolean }) {
  const grid = await leagueAwardGrid(lg);
  if (!grid.seasons.length) return null;
  const { say, plural } = await currentSpeaker();
  const head = full ? { seasons: grid.seasons, logos: grid.logos } : awardHead(grid, AWARD_GRID_HEAD);
  return (
    <section className="section">
      {full ? <h1>{say("awards.bySeason")}</h1> : <h2>{say("awards.bySeason")}</h2>}
      <p className="note">{say("awards.bySeasonNote", { winners: plural("count.awardWinners", grid.winners), seasons: plural("count.seasons", grid.seasons.length) })}</p>
      <CupSprite leagues={[lg]} />
      <div className="tablebox awardsgrid"><AwardsGrid lg={lg} columns={grid.columns} head={head.seasons} logos={head.logos} total={grid.seasons.length} /></div>
    </section>
  );
});
