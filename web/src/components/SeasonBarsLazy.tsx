"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { leagueSeasonBars } from "@/lib/leagueSeasonRows";
import { useLeagueSeasonRows } from "./LeagueSeasonRows";
import { useSeen } from "./useSeen";

const SeasonBars = dynamic(() => import("./SeasonBars").then((m) => m.SeasonBars), { ssr: false });

/** The bar chart's height (SeasonBars draws 220): the box keeps it before the chart is drawn, so the page below does not jump. */
const CHART_HEIGHT = 220;

/**
 * The games a league held, a bar per season, drawn in the browser when the reader gets near it. It is bars of figures the season chips and the
 * league's page already hold, with no words a search needs, and with a bar for every season of a long history it was 50 KB of markup (and its data
 * again in the payload). It reads the league's season rows (components/LeagueSeasonRows.tsx), so no data of its own travels with the page.
 */
export function SeasonBarsLazy({ lg }: { lg: string }) {
  const { rows } = useLeagueSeasonRows();
  const list = useMemo(() => leagueSeasonBars(lg, rows), [lg, rows]);
  const [ref, seen] = useSeen<HTMLDivElement>();
  return <div ref={ref} style={seen ? undefined : { minHeight: CHART_HEIGHT }}>{seen ? <SeasonBars lg={lg} list={list} /> : null}</div>;
}
