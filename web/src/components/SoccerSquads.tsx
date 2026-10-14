import Link from "next/link";
import type { PositionBook } from "@/components/PositionKey";
import { SoccerTeamName } from "@/components/SoccerTeamName";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { Squad } from "@/lib/soccer";
import { soccerPlayerPath } from "@/lib/soccerPath";
import "./soccer.css";

/** One expandable list per team of a tournament: shirt number, player, position, matches played, started, goals, cards. `flags` maps a team id to its flag code. */
export async function SoccerSquads({ squads, flags, book }: { squads: Squad[]; flags: Map<string, string | null>; book: PositionBook }) {
  const { say } = await currentSpeaker();
  const teams = [...new Map(squads.map((s) => [s.team_id, s])).values()];
  return (
    <>
      {teams.map((tm) => (
        <details className="sc-squad" key={tm.team_id}>
          <summary><SoccerTeamName slug={tm.team_slug} name={tm.team} flag={flags.get(tm.team_id)} link={false} /></summary>
          <table>
            <thead>
              <tr>
                <th className="num">{say("wc.col.no")}</th><th>{say("wc.col.player")}</th><th>{say("wc.col.position")}</th>
                <th className="num">{say("wc.col.played")}</th><th className="num">{say("wc.col.started")}</th><th className="num">{say("wc.col.goals")}</th>
                <th className="num">{say("wc.col.yellow")}</th><th className="num">{say("wc.col.red")}</th>
              </tr>
            </thead>
            <tbody>
              {squads.filter((s) => s.team_id === tm.team_id).map((s) => (
                <tr key={s.person_id}>
                  <td className="num">{s.shirt_number ?? ""}</td>
                  <td className="team"><Link href={soccerPlayerPath(s.person_id, s.player)} prefetch={false}>{s.player}</Link></td>
                  <td>{book.code(s.position_code, ["soccer"])}</td><td className="num">{s.played}</td><td className="num">{s.started}</td><td className="num">{s.goals || ""}</td>
                  <td className="num">{s.yellow || ""}</td><td className="num">{s.red || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
    </>
  );
}
