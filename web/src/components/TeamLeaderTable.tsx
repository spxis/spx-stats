"use client";

import { useMemo } from "react";
import { TeamLabel } from "@/components/TeamLabel";
import { LEADER_HEAD, leaderShare, type LeaderTeamLine } from "@/lib/leaderLines";
import { showDelta, showTeam, type TeamKind } from "@/lib/leaderStats";
import { seasonLabel } from "@/lib/leagues";
import { recordText } from "@/lib/record";
import { tableOf, type SortKey } from "@/lib/sort";
import { useSpeaker } from "./i18n/LocaleProvider";
import { SortTable } from "./SortTable";
import { useReveal } from "./useReveal";
import "./leaders.css";

/**
 * Every team of a season with the chosen statistic, built here from one short line a team (lib/leaderLines.ts). The first rows are drawn at once; the others when "Show all" is
 * pressed or the table is sorted another way, and (`full`) where the address asks for every row. `label` and `title` are the statistic's column head, already in the reader's language.
 */
export function TeamLeaderTable({ lg, year, lines, kind, label, title, mean, best, last, everCount, champion, defending, full, hrefAll, sort }: {
  lg: string; year: number; lines: LeaderTeamLine[]; kind: TeamKind; label: string; title?: string; mean: number; best: number; last: number; everCount: number;
  champion: number | null; defending: { f: number; label: string; streak: number } | null; full: boolean; hrefAll: string; sort?: SortKey[];
}) {
  const { say, fmt } = useSpeaker();
  const more = useReveal(lines, LEADER_HEAD, full);
  const table = useMemo(() => tableOf(more.shown, [
    { key: "rk", label: say("leaders.col.rank"), num: true, cls: "rk", get: (r) => r[11] },
    {
      key: "team", label: say("col.team"), cls: "team", get: (r) => r[2],
      cell: (r) => <>
        <TeamLabel lg={lg} f={r[1]} name={r[2]} year={year} abbr={r[3] || undefined} logo={r[4] || null} />
        {champion != null && r[1] === champion ? <span className="defending winner" title={say("season.wonTitle", { season: seasonLabel(lg, year) })}>{say("season.winner")}</span> : null}
        {defending != null && r[1] === defending.f ? <span className="defending" title={say("season.wonTitle", { season: defending.label })}>{defending.streak > 1 ? say("season.defendingMany", { n: fmt(defending.streak) }) : say("season.defending")}</span> : null}
      </>,
    },
    {
      key: "value", label, num: true, title, get: (r) => r[5],
      cell: (r) => <span className="lval"><span className="lbar" aria-hidden="true"><i style={{ width: `${Math.round(leaderShare(r[5], best, last) * 100)}%` }} /></span><b>{showTeam(kind, r[5], fmt)}</b></span>,
    },
    { key: "vs", label: say("leaders.col.vsAvg"), num: true, title: say("leaders.col.vsAvgTitle"), get: (r) => r[5] - mean, cell: (r) => <span className="dim">{showDelta(kind, r[5] - mean)}</span> },
    { key: "gp", label: say("col.gp"), num: true, title: say("col.gpTeamTitle"), get: (r) => r[6] },
    { key: "rec", label: say("col.record"), get: (r) => r[7], cell: (r) => recordText({ w: r[7], l: r[8], t: r[9], otl: r[10] }) },
    { key: "ever", label: say("leaders.col.ever"), num: true, title: say("leaders.col.everTitle", { count: fmt(everCount) }), get: (r) => r[12], cell: (r) => <span className="dim">{`#${fmt(r[12])}`}</span> },
  ], (r) => r[0], (r) => (r[11] === 1 ? "leadrow" : undefined)), [more.shown, say, fmt, lg, year, kind, label, title, mean, best, last, everCount, champion, defending]);
  return (
    <div className="tablebox ltable">
      <SortTable {...table} def="rk.asc" initial={sort} partial={full ? undefined : { total: lines.length, loaded: more.loaded, state: more.state, load: more.load, href: hrefAll }} />
    </div>
  );
}
