import { getBrands } from "@/lib/data";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { roundSay } from "@/lib/roundWords";
import { describeRounds, deriveSeries, roundTitle } from "@/lib/series";
import { getPaths } from "@/lib/teamSlugs";
import { getPlayoffGames } from "@/lib/seriesData";
import { SeriesCard } from "./SeasonPlayoffs";
import "./series.css";
import { guard } from "@/lib/loadGuard";

/** The playoff series one franchise played in a season, each linking to its series page. Draws nothing when it played none. */
export const TeamPlayoffSeries = guard(async function TeamPlayoffSeries({ lg, year, f }: { lg: string; year: number; f: number }) {
  const [games, brands, sp, paths] = await Promise.all([getPlayoffGames(lg, year), getBrands(), currentSpeaker(), getPaths()]);
  const say = roundSay(sp);
  const all = deriveSeries(lg, year, games);
  const { round, names } = describeRounds(lg, year, all, say);
  const mine = all.map((s, i) => ({ s, name: roundTitle(names, round[i], sp.say("playoffs.robin")) })).filter((x) => x.s.sides.some((t) => t.f === f));
  if (!mine.length) return null;
  return (
    <section className="section">
      <h2>{say("bracket.mine")}</h2>
      <div className="bracket mine">
        {mine.map(({ s, name }) => (
          <div className="round" key={`${s.sides[0].f}-${s.sides[1].f}-${s.meeting}`}>
            <h3>{name}</h3>
            <SeriesCard paths={paths} lg={lg} s={s} brands={brands} year={year} say={say} />
          </div>
        ))}
      </div>
    </section>
  );
});
