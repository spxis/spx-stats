"use client";

import { useMemo } from "react";
import Link from "@/components/Link";
import { fmt3 } from "@/lib/format";
import type { OutageClubLine, OutageCoachLine, OutagePerson, OutagePersonLine, OutageRosterLine } from "@/lib/outageLines";
import { tableOf, type ColumnSpec } from "@/lib/sort";
import { useSpeaker } from "./i18n/LocaleProvider";
import { Tm, useOutageNames } from "./OutageTeams";
import { SortTable } from "./SortTable";
import { usePaths } from "./SlugProvider";
import "./outage.css";

const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "±");
const share = (n: number) => fmt3(Math.abs(n)).replace(/^0/, "");
const rec = (w: number, l: number, t: number, otl: number) => `${w}-${l}${t ? `-${t}` : ""}${otl ? `-${otl}` : ""}`;

/**
 * The tables of a season-outage page, built here from one short line a club (lib/outageLines.ts): the cells the server used to draw, now made in the browser (and on the server
 * for the first paint, so every row is in the page). `sideB` and `sideA` name the season before the gap and the one after it.
 */
export function OutageClubsTable({ lg, lines, sideB, sideA, points: [ptsB, ptsA], metric }: {
  lg: string; lines: OutageClubLine[]; sideB: { year: number; label: string }; sideA: { year: number; label: string }; points: [boolean, boolean]; metric: string;
}) {
  const { say } = useSpeaker();
  const paths = usePaths();
  const nameOf = useOutageNames();
  const table = useMemo(() => {
    const cols: ColumnSpec<OutageClubLine>[] = [
      { key: "team", label: say("col.team"), cls: "team", get: (l) => nameOf.get(l[0]) ?? "", cell: (l) => <><Tm f={l[0]} y={(l[3] ? sideA : sideB).year} />{l[1] ? <span className="defending">{say(`outage.kind.${l[1]}` as "outage.kind.joined")}</span> : null}</> },
      { key: "rb", label: say("outage.colRank", { season: sideB.label }), num: true, get: (l) => l[2]?.[0] ?? null },
      { key: "recb", label: say("col.record"), title: sideB.label, get: (l) => l[2]?.[1] ?? null, cell: (l) => (l[2] ? <Link href={paths.teamSeason(lg, l[0], sideB.year)} prefetch={false}>{rec(l[2][2], l[2][3], l[2][4], l[2][5])}</Link> : "") },
      ...(ptsB ? [{ key: "ptsb", label: say("col.pts"), title: sideB.label, num: true, get: (l: OutageClubLine) => l[2]?.[6] ?? null } as ColumnSpec<OutageClubLine>] : []),
      { key: "ra", label: say("outage.colRank", { season: sideA.label }), num: true, get: (l) => l[3]?.[0] ?? null },
      { key: "reca", label: say("col.record"), title: sideA.label, get: (l) => l[3]?.[1] ?? null, cell: (l) => (l[3] ? <Link href={paths.teamSeason(lg, l[0], sideA.year)} prefetch={false}>{rec(l[3][2], l[3][3], l[3][4], l[3][5])}</Link> : "") },
      ...(ptsA ? [{ key: "ptsa", label: say("col.pts"), title: sideA.label, num: true, get: (l: OutageClubLine) => l[3]?.[6] ?? null } as ColumnSpec<OutageClubLine>] : []),
      { key: "places", label: say("outage.colPlaces"), num: true, title: say("outage.colPlacesTitle"), get: (l) => l[4], cell: (l) => (l[4] == null ? "" : <span className={l[4] > 0 ? "up" : l[4] < 0 ? "down" : undefined}>{sign(l[4])}{Math.abs(l[4])}</span>) },
      { key: "chg", label: say("outage.colChange", { metric }), num: true, get: (l) => l[5], cell: (l) => (l[5] == null ? "" : <span className={l[5] > 0.005 ? "up" : l[5] < -0.005 ? "down" : undefined}>{sign(l[5])}{share(l[5])}</span>) },
    ];
    return tableOf(lines, cols, (l) => l[0]);
  }, [lines, say, paths, lg, sideB, sideA, ptsB, ptsA, metric, nameOf]);
  return <SortTable {...table} param="sort_clubs" def="ra.asc" />;
}

export function OutageCoachesTable({ lines, sideB, sideA, year }: { lines: OutageCoachLine[]; sideB: string; sideA: string; year: number }) {
  const { say } = useSpeaker();
  const nameOf = useOutageNames();
  const table = useMemo(() => tableOf(lines, [
    { key: "team", label: say("col.team"), cls: "team", get: (c) => nameOf.get(c[0]) ?? "", cell: (c) => <Tm f={c[0]} y={year} /> },
    { key: "cb", label: say("outage.coachIn", { season: sideB }), get: (c) => c[1] || null },
    { key: "ca", label: say("outage.coachIn", { season: sideA }), get: (c) => c[2] || null },
    { key: "st", label: say("outage.coachStatus"), get: (c) => (c[3] < 0 ? null : c[3]), cell: (c) => (c[3] < 0 ? "" : c[3] ? <span className="defending">{say("outage.coachNew")}</span> : say("outage.coachSame")) },
  ] as ColumnSpec<OutageCoachLine>[], (c) => c[0]), [lines, say, sideB, sideA, nameOf, year]);
  return <SortTable {...table} param="sort_coach" def="team.asc" />;
}

const People = ({ list }: { list: readonly OutagePerson[] }) => <>{list.map(([href, name], i) => <span key={href}>{i ? ", " : ""}<Link href={href} prefetch={false}>{name}</Link></span>)}</>;

export function OutageRostersTable({ lines, sideB, sideA, year }: { lines: OutageRosterLine[]; sideB: string; sideA: string; year: number }) {
  const { say } = useSpeaker();
  const nameOf = useOutageNames();
  const table = useMemo(() => tableOf(lines, [
    { key: "team", label: say("col.team"), cls: "team", get: (c) => nameOf.get(c[0]) ?? "", cell: (c) => <Tm f={c[0]} y={year} /> },
    { key: "n", label: say("outage.colPlayers", { season: sideB }), num: true, get: (c) => c[1] },
    { key: "stay", label: say("outage.colStayed"), num: true, get: (c) => c[2] },
    { key: "left", label: say("outage.colLeft"), num: true, title: say("outage.colLeftTitle"), get: (c) => c[3] },
    { key: "new", label: say("outage.colArrived"), num: true, title: say("outage.colArrivedTitle"), get: (c) => c[4] },
    { key: "cont", label: say("outage.colContinuity"), num: true, title: say("outage.colContinuityTitle", { after: sideA, before: sideB }), get: (c) => c[5], cell: (c) => (c[5] == null ? "" : `${Math.round(c[5] * 100)}%`) },
    { key: "ret", label: say("outage.colReturners"), cls: "names", get: () => null, cell: (c) => <People list={c[6]} /> },
    { key: "dep", label: say("outage.colDepartures"), cls: "names", get: () => null, cell: (c) => <People list={c[7]} /> },
    { key: "arr", label: say("outage.colArrivals"), cls: "names", get: () => null, cell: (c) => <People list={c[8]} /> },
  ] as ColumnSpec<OutageRosterLine>[], (c) => c[0]), [lines, say, sideB, sideA, nameOf, year]);
  return <SortTable {...table} param="sort_roster" def="cont.desc" />;
}

/** One list of players across the gap (careers that ended, first seasons after it, those who changed clubs): a link, the seasons played and the club. */
export function OutagePeopleList({ lines }: { lines: OutagePersonLine[] }) {
  const { plural } = useSpeaker();
  return (
    <ul>
      {lines.map(([href, name, seasons, f, y]) => (
        <li key={href}>
          <Link href={href} prefetch={false}>{name}</Link>
          <span className="meta">
            {" "}{plural("count.seasons", seasons)}
            {f >= 0 ? <> · <Tm f={f} y={y} /></> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
