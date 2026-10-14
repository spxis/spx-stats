import Link from "next/link";
import { SoccerFlag } from "@/components/SoccerFlag";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { Match } from "@/lib/soccer";
import { teamName } from "@/lib/soccerNames";
import { soccerMatchPath } from "@/lib/soccerPath";
import { scoreLines, stageName } from "@/lib/soccerView";
import "./soccer.css";

/**
 * The knockout rounds as columns, earliest first: one box per match with both teams, their goals and a note for extra time or a shootout.
 * The box opens the match. (Boxes are not joined by lines: a replay, a third-place match or a round of 16 that was a first round would not fit a drawn tree.)
 *
 * Where kyogijo's coming `roadToFinal` plugs in (board ticket cmv7f4bq50007l9060dnvj3qo, which waits for the next kyogijo version; not built here): it
 * would draw a champion's or finalist's path round by round with round team marks, from the same `matches` these columns are made of. The tournament
 * page would show it above or instead of these columns for the final's two teams; the round flags drawn here are the marks it would reuse.
 */
export async function SoccerKnockout({ matches }: { matches: Match[] }) {
  const { say, locale } = await currentSpeaker();
  const stages = [...new Set(matches.map((m) => m.stage_order))].sort((a, b) => a - b);
  return (
    <div className="sc-rounds">
      {stages.map((order) => {
        const inStage = matches.filter((m) => m.stage_order === order);
        return (
          <div className="sc-round" key={order}>
            <h3>{stageName(say, inStage[0].stage_key)}</h3>
            {inStage.map((m) => {
              const s = scoreLines(say, m);
              const side = (name: string, slug: string, flag: string | null, goals: number, pens: number | null, won: boolean) => (
                <div className={"row" + (won ? " win" : "")}>
                  <span className="sct"><SoccerFlag code={flag} />{teamName({ name, slug, flag }, locale)}</span>
                  <span className="n">{goals}{pens != null && m.shootout ? <small> ({pens})</small> : null}</span>
                </div>
              );
              return (
                <Link className="sc-tie" key={m.match_id} href={soccerMatchPath(m.year, m.match_id, m.home, m.away)} prefetch={false}>
                  {side(m.home, m.home_slug, m.home_flag, m.home_goals, m.home_penalties, m.winner_team_id === m.home_team_id)}
                  {side(m.away, m.away_slug, m.away_flag, m.away_goals, m.away_penalties, m.winner_team_id === m.away_team_id)}
                  {s.note ? <div className="sub">{s.note}</div> : null}
                </Link>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
