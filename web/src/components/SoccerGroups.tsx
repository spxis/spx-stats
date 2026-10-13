import { SoccerTeamName } from "@/components/SoccerTeamName";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { Standing } from "@/lib/soccer";
import { groupName, stageName } from "@/lib/soccerView";
import "./soccer.css";

/** The group tables of a tournament, one block per stage (a first group stage, a second one, a final round), each group a small table. */
export async function SoccerGroups({ standings }: { standings: Standing[] }) {
  const { say, fmt } = await currentSpeaker();
  const stages = [...new Set(standings.map((s) => s.stage_number))].sort((a, b) => a - b);
  const num = (n: number | null) => (n == null ? "" : fmt(n));
  return (
    <>
      {stages.map((st) => {
        const inStage = standings.filter((s) => s.stage_number === st);
        const groups = [...new Set(inStage.map((s) => s.group_name))].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
        return (
          <div key={st}>
            {stages.length > 1 ? <h3>{stageName(say, inStage[0].stage_key)}</h3> : null}
            <div className="sc-groups">
              {groups.map((g) => (
                <div className="sc-group" key={g}>
                  <h3>{groupName(say, g)}</h3>
                  <table>
                    <thead>
                      <tr>
                        <th className="num">#</th><th>{say("col.team")}</th>
                        <th className="num" title={say("wc.col.playedTitle")}>{say("wc.col.played")}</th>
                        <th className="num">{say("wc.col.w")}</th><th className="num">{say("wc.col.d")}</th><th className="num">{say("wc.col.l")}</th>
                        <th className="num" title={say("wc.col.goalsForTitle")}>{say("wc.col.gf")}</th><th className="num" title={say("wc.col.goalsAgainstTitle")}>{say("wc.col.ga")}</th>
                        <th className="num">{say("col.pts")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inStage.filter((s) => s.group_name === g).map((s) => (
                        <tr key={s.team_id} className={s.advanced ? "adv" : undefined}>
                          <td className="num">{s.position}</td>
                          <td className="team"><SoccerTeamName slug={s.team_slug} name={s.team} flag={s.flag_code} /></td>
                          <td className="num">{num(s.played)}</td><td className="num">{num(s.wins)}</td><td className="num">{num(s.draws)}</td><td className="num">{num(s.losses)}</td>
                          <td className="num">{num(s.goals_for)}</td><td className="num">{num(s.goals_against)}</td><td className="num"><b>{num(s.points)}</b></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <p className="note">{say("wc.advancedNote")}</p>
    </>
  );
}
