import Link from "next/link";
import { getBrands } from "@/lib/data";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { sayFor, type Say } from "@/lib/seriesCopy";
import { brandFor } from "@/lib/brand";
import { describeRounds, deriveSeries, seriesPath, type Series } from "@/lib/series";
import { getPlayoffGames } from "@/lib/seriesData";
import { TeamLogo } from "./TeamLogo";
import "./series.css";

/** One series as a card: both teams, the winner in bold, the score; the card opens the series page. */
export function SeriesCard({ lg, s, brands, year, say }: { lg: string; s: Series; brands: Awaited<ReturnType<typeof getBrands>>; year: number; say: Say }) {
  const single = s.games.length === 1 && s.games[0].score[0] != null;
  const goals = s.basis === "goals";
  const num = (i: 0 | 1) => (single ? s.games[0].score[i] : goals ? s.sides[i].scored : s.sides[i].wins);
  return (
    <Link href={seriesPath(lg, year, s)} prefetch={false} className="sercard" title={say("card.title", { a: s.sides[0].name, b: s.sides[1].name })}>
      {([0, 1] as const).map((i) => (
        <span key={i} className={`serrow${s.winner === i ? " won" : ""}`}>
          <TeamLogo url={brandFor(brands, s.sides[i].f, year)?.logo_url} size={18} />
          <span className="nm">{s.sides[i].name}</span>
          <b>{num(i)}</b>
        </span>
      ))}
      <span className="sermeta">{goals ? say("card.totalScore") : single ? say("card.oneGame") : say("card.games", { count: s.games.length })}{s.winner == null ? say("card.notSettled") : ""}</span>
    </Link>
  );
}

/** The playoff bracket of a season, round by round, derived from its playoff games. Draws nothing when there are none. */
export async function SeasonPlayoffs({ lg, year }: { lg: string; year: number }) {
  const [games, brands, sp] = await Promise.all([getPlayoffGames(lg, year), getBrands(), currentSpeaker()]);
  const series = deriveSeries(lg, year, games);
  if (!series.length) return null;
  const say = sayFor(sp);
  const { round, names } = describeRounds(lg, year, series, say);
  const rounds = names.map((name, i) => ({ name, list: series.filter((_, k) => round[k] === i + 1) })).filter((r) => r.list.length);
  return (
    <section className="section" id="playoffs">
      <h2>{say("bracket.title")}</h2>
      <p className="note">{say("bracket.note", { count: sp.fmt(series.length) })}</p>
      <div className="bracket" style={{ "--rounds": rounds.length } as React.CSSProperties}>
        {rounds.map((r) => (
          <div className="round" key={r.name}>
            <h3>{r.name}</h3>
            {r.list.map((s) => <SeriesCard key={`${s.sides[0].f}-${s.sides[1].f}-${s.meeting}`} lg={lg} s={s} brands={brands} year={year} say={say} />)}
          </div>
        ))}
      </div>
    </section>
  );
}
