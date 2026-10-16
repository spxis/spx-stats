"use client";

import Link from "@/components/Link";
import { useMemo } from "react";
import { recShare, tableOf } from "@/lib/sort";
import { fmt3 } from "@/lib/format";
import { seasonLabel } from "@/lib/leagues";
import { seasonPath } from "@/lib/slug";
import { standPagePath, standRestPath, type StandFlags, type StandLine } from "@/lib/standLines";
import { useSpeaker } from "./i18n/LocaleProvider";
import { usePaths } from "./SlugProvider";
import { SortTable } from "./SortTable";
import { TeamLogo } from "./TeamLogo";
import { MiniCup } from "./TrophyIcon";
import { NoSeason } from "./ui";
import { useMoreLines } from "./useMoreLines";

/**
 * A franchise's standings, season by season. The page sends the newest seasons as plain data (so they are in the page for readers and search, once,
 * not twice as markup and payload) and the older ones come from the franchise's `rows/standings` address when "Show all" is pressed or the table is
 * sorted another way. Without script the button is a link to the full list as a page of its own.
 */
export function StandingsTable({ lg, f, teamPath, head, total, flags }: { lg: string; f: number; teamPath: string; head: StandLine[]; total: number; flags: StandFlags }) {
  const { say, fmt } = useSpeaker();
  const paths = usePaths();
  const more = useMoreLines<StandLine>(standRestPath(teamPath), head);
  const { showT, showO, showP, maxPct, logos } = flags;
  const table = useMemo(() => tableOf(more.lines, [
    {
      key: "champ", label: say("col.champion"), hideLabel: true, cls: "cupcol", title: say("team.champSeason"), get: (r) => (r.c ? 1 : 0),
      cell: (r) => (r.c ? <MiniCup league={lg} /> : null),
    },
    {
      key: "season", label: say("col.season"), num: true, cls: "seasoncell", get: (r) => r.y,
      cell: (r) => <Link href={seasonPath(lg, r.y)} prefetch={false}>{seasonLabel(lg, r.y)}</Link>,
    },
    {
      key: "team", label: say("col.team"), cls: "team", get: (r) => r.team ?? null,
      cell: (r) => r.idle ? <NoSeason kind={r.idle} /> : <><TeamLogo url={r.lo != null ? logos[r.lo] : null} /><span className="tn-long">{r.team || ""}</span><abbr className="tn-short" title={r.team}>{r.ab}</abbr>{r.bare ? <span className="seasoncell barenote"> · {r.bare}</span> : null}</>,
    },
    {
      key: "gp", label: say("col.gp"), num: true, title: say("col.gpSeasonTitle"), get: (r) => r.gp,
      cell: (r) => (r.g ? (
        <Link href={paths.teamSeason(lg, f, r.y)} prefetch={false} title={say("team.everyGame", { season: seasonLabel(lg, r.y) })}>{r.gp}</Link>
      ) : r.gp ?? ""),
    },
    { key: "w", label: say("col.w"), num: true, get: (r) => r.w }, { key: "l", label: say("col.l"), num: true, get: (r) => r.l },
    ...(showT ? [{ key: "t", label: say("col.t"), num: true, get: (r: StandLine) => r.t }] : []),
    ...(showO ? [{ key: "otl", label: say("col.otl"), num: true, get: (r: StandLine) => r.otl }] : []),
    ...(showP ? [{ key: "pts", label: say("col.pts"), num: true, get: (r: StandLine) => r.pts }] : []),
    { key: "pf", label: say("col.pf"), num: true, get: (r) => r.pf, cell: (r) => (r.pf != null ? fmt(r.pf) : "") },
    { key: "pa", label: say("col.pa"), num: true, get: (r) => r.pa, cell: (r) => (r.pa != null ? fmt(r.pa) : "") },
    { key: "home", label: say("col.home"), get: (r) => recShare(r.home), cell: (r) => r.home || "" },
    { key: "road", label: say("col.road"), get: (r) => recShare(r.road), cell: (r) => r.road || "" },
    {
      key: "pct", label: say("col.pct"), num: true, get: (r) => r.pct,
      cell: (r) => (
        <>
          {r.pct != null ? fmt3(r.pct) : ""}
          {r.pct != null ? <span className="pctbar" style={{ width: `${Math.round((60 * r.pct) / maxPct)}px` }} /> : null}
        </>
      ),
    },
  ], (r) => r.y, (r) => (r.idle ? "idlerow" : undefined)), [more.lines, say, fmt, paths, lg, f, showT, showO, showP, maxPct, logos]);
  return (
    <SortTable {...table} def="season.desc"
      partial={{ total, loaded: more.state === "done" || more.lines.length >= total, state: more.state, load: more.load, href: standPagePath(teamPath) }} />
  );
}
