import Link from "next/link";
import { PositionList } from "@/components/PositionCode";
import { soccerPlayerPath } from "@/lib/soccerPath";
import type { SquadLabels, SquadLine } from "@/lib/soccerSquad";
import "./soccer.css";

/**
 * A squad: shirt number, player, position, matches played, started, goals, cards. Plain markup with no hooks, so the squad page draws it on the
 * server and the closed lists of the tournament page draw it in the browser when one is opened (components/LazySquad.tsx).
 */
export function SoccerSquadTable({ lines, labels }: { lines: readonly SquadLine[]; labels: SquadLabels }) {
  return (
    <table>
      <thead>
        <tr>
          <th className="num">{labels.no}</th><th>{labels.player}</th><th>{labels.position}</th>
          <th className="num">{labels.played}</th><th className="num">{labels.started}</th><th className="num">{labels.goals}</th>
          <th className="num">{labels.yellow}</th><th className="num">{labels.red}</th>
        </tr>
      </thead>
      <tbody>
        {lines.map(([id, name, no, pos, posName, played, started, goals, yellow, red]) => (
          <tr key={id}>
            <td className="num">{no ?? ""}</td>
            <td className="team"><Link href={soccerPlayerPath(id, name)} prefetch={false}>{name}</Link></td>
            <td>{pos ? <PositionList items={[{ code: pos, name: posName }]} /> : null}</td>
            <td className="num">{played}</td><td className="num">{started}</td><td className="num">{goals || ""}</td>
            <td className="num">{yellow || ""}</td><td className="num">{red || ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
