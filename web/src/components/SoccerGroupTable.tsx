"use client";

import { SoccerTeamName } from "@/components/SoccerTeamName";
import { useSpeaker } from "@/components/i18n/LocaleProvider";
import "./soccer.css";

/** One row of a group table as the page sends it: [place, team's slug, name, flag code, played, won, drawn, lost, goals for, goals against, points, advanced (1 or 0)]; a figure the data lacks is null. */
export type GroupLine = [place: number, slug: string, name: string, flag: string | null, played: number | null, won: number | null, drawn: number | null, lost: number | null, gf: number | null, ga: number | null, pts: number | null, advanced: 0 | 1];

/**
 * One group's small table. A client component taking short rows: a tournament page holds a dozen groups of four teams, and as server elements each table
 * was 3 KB of the page's payload on top of its markup; as arrays it is under 0.6 KB. The markup is still in the page.
 */
export function SoccerGroupTable({ rows }: { rows: readonly GroupLine[] }) {
  const { say, fmt } = useSpeaker();
  const num = (n: number | null) => (n == null ? "" : fmt(n));
  return (
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
        {rows.map(([place, slug, name, flag, played, won, drawn, lost, gf, ga, pts, advanced]) => (
          <tr key={slug} className={advanced ? "adv" : undefined}>
            <td className="num">{place}</td>
            <td className="team"><SoccerTeamName slug={slug} name={name} flag={flag} /></td>
            <td className="num">{num(played)}</td><td className="num">{num(won)}</td><td className="num">{num(drawn)}</td><td className="num">{num(lost)}</td>
            <td className="num">{num(gf)}</td><td className="num">{num(ga)}</td><td className="num"><b>{num(pts)}</b></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
