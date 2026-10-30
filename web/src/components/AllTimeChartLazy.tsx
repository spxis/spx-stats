"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo } from "react";
import type { AllTimePhase } from "@/lib/allTime";
import { allTimeRestPath, atGrid, lineAt, shareAt, shownAt } from "@/lib/allTimeLines";
import { useSpeaker } from "./i18n/LocaleProvider";
import type { ChartTeam } from "./AllTimeCharts";
import { usePaths } from "./SlugProvider";
import { useAllTime } from "./useAllTime";
import { useSeen } from "./useSeen";

const WinLossScatter = dynamic(() => import("./AllTimeCharts").then((m) => m.WinLossScatter), { ssr: false });
const SeasonGrid = dynamic(() => import("./AllTimeCharts").then((m) => m.SeasonGrid), { ssr: false });

/** The height of each chart before it is drawn (the scatter is 300 to 520 px high, the grid a row of 13 px for each franchise and a header), so the page below does not jump. */
const SCATTER_HEIGHT = 420;
const gridHeight = (rows: number) => 24 + rows * 13;

/**
 * The scatter of wins against losses and the grid of every season, drawn in the browser when the reader gets near them. They are drawings with no words a
 * search needs (the table lists the same figures), and the grid alone was hundreds of KB of markup for a league with a long history. The franchises come from
 * the league's `rows/all-time` address, one request for both.
 */
export function AllTimeChartLazy({ kind, lg, phase, active, rows, first, last }: { kind: "scatter" | "grid"; lg: string; phase: AllTimePhase; active: boolean; rows: number; first: number; last: number }) {
  const { say } = useSpeaker();
  const paths = usePaths();
  const [ref, seen] = useSeen<HTMLDivElement>();
  const all = useAllTime(allTimeRestPath(lg), null);
  const load = all.load;
  useEffect(() => { if (seen) load(); }, [seen, load]);
  const teams = useMemo<ChartTeam[]>(() => shownAt(all.rows, phase, active).map((t) => {
    const l = lineAt(t, phase);
    return {
      f: t.f, name: t.name, abbr: t.ab, href: paths.team(lg, t.f), tl: t.tl ?? null, td: t.td ?? null, active: !!t.on,
      w: l.w, l: l.l, t: l.t, otl: l.otl, share: shareAt(t, phase), titles: t.ti?.length ?? 0, grid: atGrid(t),
    };
  }), [all.rows, phase, active, paths, lg]);
  const drawn = all.state === "done";
  return (
    <div ref={ref} style={drawn ? undefined : { minHeight: kind === "grid" ? gridHeight(rows) : SCATTER_HEIGHT }}>
      {drawn ? (kind === "grid" ? <SeasonGrid lg={lg} teams={teams} first={first} last={last} /> : <WinLossScatter teams={teams} />) : null}
      {all.state === "failed" ? <p className="note">{say("load.failed")}</p> : null}
    </div>
  );
}
