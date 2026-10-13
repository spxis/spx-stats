import { MlsClubName } from "@/components/MlsClubName";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { Standing } from "@/lib/soccer";
import "./soccer.css";

/**
 * A season's league tables: one for each conference and the overall table, each a small table. Positions as the season article lists them; a bar at the
 * left of a row marks a club that played in the playoffs. The shootout-wins column appears only in the seasons that had them (1996-1999).
 */
export async function MlsTables({ standings }: { standings: Standing[] }) {
  const { say, fmt } = await currentSpeaker();
  const num = (n: number | null | undefined) => (n == null ? "" : fmt(n));
  const groups = [...new Set(standings.map((s) => s.group_name))].sort((a, b) => (a === "Overall" ? 1 : b === "Overall" ? -1 : a.localeCompare(b)));
  const hasSo = standings.some((s) => (s.shootout_wins ?? 0) > 0);
  const label = (g: string) => (g === "Eastern Conference" ? say("mls.east") : g === "Western Conference" ? say("mls.west") : say("mls.overall"));
  return (
    <>
      <div className="sc-groups">
        {groups.map((g) => (
          <div className="sc-group" key={g}>
            <h3>{label(g)}</h3>
            <table>
              <thead>
                <tr>
                  <th className="num">#</th><th>{say("col.team")}</th>
                  <th className="num" title={say("wc.col.playedTitle")}>{say("wc.col.played")}</th>
                  <th className="num">{say("wc.col.w")}</th>
                  {hasSo ? <th className="num" title={say("mls.col.soWinsTitle")}>{say("mls.col.soWins")}</th> : null}
                  <th className="num">{say("wc.col.d")}</th><th className="num">{say("wc.col.l")}</th>
                  <th className="num" title={say("wc.col.goalsForTitle")}>{say("wc.col.gf")}</th><th className="num" title={say("wc.col.goalsAgainstTitle")}>{say("wc.col.ga")}</th>
                  <th className="num">{say("col.pts")}</th>
                </tr>
              </thead>
              <tbody>
                {standings.filter((s) => s.group_name === g).map((s) => (
                  <tr key={s.team_id} className={s.advanced ? "adv" : undefined}>
                    <td className="num">{s.position}</td>
                    <td className="team"><MlsClubName slug={s.team_slug} name={s.team_name ?? s.team} /></td>
                    <td className="num">{num(s.played)}</td><td className="num">{num(s.wins)}</td>
                    {hasSo ? <td className="num">{num(s.shootout_wins)}</td> : null}
                    <td className="num">{num(s.draws)}</td><td className="num">{num(s.losses)}</td>
                    <td className="num">{num(s.goals_for)}</td><td className="num">{num(s.goals_against)}</td><td className="num"><b>{num(s.points)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <p className="note">{say("mls.tablesNote")}</p>
    </>
  );
}
