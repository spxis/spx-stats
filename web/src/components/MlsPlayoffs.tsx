import Link from "next/link";
import { MlsClubName } from "@/components/MlsClubName";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { mlsMatchPath } from "@/lib/mlsPath";
import { mlsStageName, playoffTies, type TieMatch } from "@/lib/mlsView";
import "./soccer.css";

/**
 * The playoffs as columns, earliest round first: one box per tie (the matches of a round between the same two clubs) with both clubs, a figure each
 * and the winner in bold. The figure is the goals of a single match, the aggregate of two legs, or the games won of a best-of-three; under it the
 * games, each from the first club's side. The box opens the first match. (Boxes are not joined by lines: the rounds changed shape too often for a tree.)
 */
export async function MlsPlayoffs<M extends TieMatch>({ matches, champion }: { matches: M[]; champion: string | null }) {
  const { say } = await currentSpeaker();
  const ties = playoffTies(matches, champion);
  const stages = [...new Set(ties.map((t) => t.stage_order))].sort((a, b) => a - b);
  return (
    <div className="sc-rounds">
      {stages.map((order) => {
        const inStage = ties.filter((t) => t.stage_order === order);
        return (
          <div className="sc-round" key={order}>
            <h3>{mlsStageName(say, inStage[0].stage_key)}</h3>
            {inStage.map((t) => {
              const first = t.matches[0];
              const last = t.matches[t.matches.length - 1];
              const side = (s: { id: string; name: string; slug: string }, figure: number) => (
                <div className={"row" + (t.winner === s.id ? " win" : "")}>
                  <MlsClubName slug={s.slug} name={s.name} link={false} />
                  <span className="n">{figure}</span>
                </div>
              );
              const aPens = last.shootout ? (last.home_team_id === t.a.id ? last.home_penalties : last.away_penalties) : null;
              const bPens = last.shootout ? (last.home_team_id === t.a.id ? last.away_penalties : last.home_penalties) : null;
              return (
                <Link className="sc-tie" key={`${order}-${t.a.id}-${t.b.id}`} href={mlsMatchPath(first.year, first.match_id, first.home, first.away)} prefetch={false}
                  title={say("mls.tieTitle", { team: t.a.name })}>
                  {side(t.a, t.aFigure)}
                  {side(t.b, t.bFigure)}
                  <div className="sub">
                    {t.matches.length > 1 ? t.games : null}
                    {aPens != null && bPens != null ? ` ${say("wc.score.pens", { home: aPens, away: bPens })}` : null}
                    {t.matches.length === 1 && !last.shootout && last.extra_time ? say("wc.score.aet") : null}
                  </div>
                </Link>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
