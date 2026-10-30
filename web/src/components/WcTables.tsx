"use client";

import { useMemo } from "react";
import Link from "@/components/Link";
import { SoccerTeamName } from "@/components/SoccerTeamName";
import { StadiumName } from "@/components/StadiumName";
import { soccerMatchPath, soccerPlayerPath } from "@/lib/soccerPath";
import { groupLabel, reachRank, reached, scoreLines } from "@/lib/soccerView";
import { tableOf } from "@/lib/sort";
import { readWcMatches, WC_HEAD, type WcMatchesWire, type WcScorerLine, type WcTeamLine } from "@/lib/wcLines";
import { useSpeaker } from "./i18n/LocaleProvider";
import { SortTable } from "./SortTable";
import { useReveal } from "./useReveal";
import "./soccer.css";

/**
 * The teams, matches and top scorers of a tournament, built here from one short line a row (lib/wcLines.ts). The first rows are drawn at once; the others when "Show all" is pressed
 * or the table is sorted another way, and on the tournament's tables page (`full`) where script is off. The cells are the ones the server used to draw.
 */
export function WcTeamsTable({ lines, full = false, hrefAll }: { lines: WcTeamLine[]; full?: boolean; hrefAll: string }) {
  const { say } = useSpeaker();
  const more = useReveal(lines, WC_HEAD, full);
  const table = useMemo(() => tableOf(more.shown, [
    { key: "team", label: say("col.team"), cls: "team", get: (x) => x[1], cell: (x) => <SoccerTeamName slug={x[0]} name={x[1]} flag={x[2]} /> },
    { key: "group", label: say("wc.col.group"), get: (x) => x[3] || null, cell: (x) => x[3].replace(/^Group\s+/, "") },
    { key: "reached", label: say("wc.col.reached"), cls: "team", get: (x) => reachRank({ performance: x[4] || null, final_position: x[5] || null }), cell: (x) => reached(say, { performance: x[4] || null, final_position: x[5] || null }) },
    { key: "p", label: say("wc.col.played"), title: say("wc.col.playedTitle"), num: true, get: (x) => x[6] },
    { key: "w", label: say("wc.col.w"), num: true, get: (x) => x[7] },
    { key: "d", label: say("wc.col.d"), num: true, get: (x) => x[8] },
    { key: "l", label: say("wc.col.l"), num: true, get: (x) => x[9] },
    { key: "gf", label: say("wc.col.gf"), title: say("wc.col.goalsForTitle"), num: true, get: (x) => x[10] },
    { key: "ga", label: say("wc.col.ga"), title: say("wc.col.goalsAgainstTitle"), num: true, get: (x) => x[11] },
    { key: "manager", label: say("wc.col.manager"), cls: "team", get: (x) => x[12] },
  ], (x) => x[0]), [more.shown, say]);
  return (
    <div className="tablebox">
      <SortTable {...table} def="reached.desc" param="sort_teams" partial={full ? undefined : { total: lines.length, loaded: more.loaded, state: more.state, load: more.load, href: hrefAll }} />
    </div>
  );
}

export function WcMatchesTable({ year, wire, full = false, hrefAll }: { year: number; wire: WcMatchesWire; full?: boolean; hrefAll: string }) {
  const { say, dt } = useSpeaker();
  const rows = useMemo(() => readWcMatches(wire), [wire]);
  const more = useReveal(rows, WC_HEAD, full);
  const table = useMemo(() => tableOf(more.shown, [
    { key: "date", label: say("col.date"), get: (m) => m.date, cell: (m) => dt.ymd(new Date(m.date)) },
    { key: "stage", label: say("wc.col.stage"), get: (m) => m.stageOrder, cell: (m) => groupLabel(say, { stage_key: m.stageKey, group_name: m.group || null }) },
    { key: "home", label: say("col.home"), cls: "team", get: (m) => m.home, cell: (m) => <SoccerTeamName slug={m.homeSlug} name={m.home} flag={m.homeFlag} /> },
    {
      key: "score", label: say("col.score"), get: (m) => m.hg + m.ag,
      cell: (m) => {
        const s = scoreLines(say, { home_goals: m.hg, away_goals: m.ag, extra_time: m.note === 1, shootout: m.note === 2, home_penalties: m.note === 2 ? m.hp : null, away_penalties: m.note === 2 ? m.ap : null });
        return <Link className="sc-score" href={soccerMatchPath(year, m.id, m.home, m.away)} prefetch={false}>{s.main}{s.note ? <small>{s.note}</small> : null}</Link>;
      },
    },
    { key: "away", label: say("wc.col.away"), cls: "team", get: (m) => m.away, cell: (m) => <SoccerTeamName slug={m.awaySlug} name={m.away} flag={m.awayFlag} /> },
    { key: "venue", label: say("col.venue"), cls: "team", get: (m) => m.venue, cell: (m) => <StadiumName name={m.venue} qid={m.venueQid} linked={m.venueLinked} rest={m.venueCity ?? undefined} /> },
  ], (m) => m.id), [more.shown, say, dt, year]);
  return (
    <div className="tablebox">
      <SortTable {...table} def="date.asc" param="sort_games" partial={full ? undefined : { total: rows.length, loaded: more.loaded, state: more.state, load: more.load, href: hrefAll }} />
    </div>
  );
}

export function WcScorersTable({ lines, full = false, hrefAll }: { lines: WcScorerLine[]; full?: boolean; hrefAll: string }) {
  const { say } = useSpeaker();
  const indexed = useMemo(() => lines.map((l, i) => ({ l, i })), [lines]);
  const more = useReveal(indexed, WC_HEAD, full);
  const table = useMemo(() => tableOf(more.shown, [
    { key: "player", label: say("wc.col.player"), cls: "team", get: (s) => s.l[1], cell: (s) => (s.l[0] ? <Link href={soccerPlayerPath(s.l[0], s.l[1])} prefetch={false}>{s.l[1]}</Link> : s.l[1]) },
    { key: "team", label: say("col.team"), cls: "team", get: (s) => s.l[3], cell: (s) => <SoccerTeamName slug={s.l[2]} name={s.l[3]} flag={s.l[4]} /> },
    { key: "goals", label: say("wc.col.goals"), num: true, get: (s) => s.l[5] },
    { key: "pens", label: say("wc.col.penalties"), num: true, get: (s) => s.l[6] },
    { key: "games", label: say("wc.col.gamesScored"), num: true, get: (s) => s.l[7] },
  ], (s) => `${s.l[0] || s.l[1]}-${s.l[2]}-${s.i}`), [more.shown, say]);
  return (
    <div className="tablebox">
      <SortTable {...table} def="goals.desc" param="sort_scorers" partial={full ? undefined : { total: lines.length, loaded: more.loaded, state: more.state, load: more.load, href: hrefAll }} />
    </div>
  );
}
