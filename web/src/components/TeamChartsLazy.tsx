"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { TeamCharts as Charts } from "./TeamCharts";
import { useSeen } from "./useSeen";

const TeamCharts = dynamic(() => import("./TeamCharts").then((m) => m.TeamCharts), { ssr: false });

/**
 * The charts of a team's page (record donuts, scoring margin, winning share, home against road), drawn in the browser when the reader gets near them.
 * They are bars and lines of figures the standings table already holds, with no words a search needs, and with a bar for every season of a long
 * history they were over 200 KB of markup, twice (in the page and in its payload). The box keeps their height so the page below does not jump.
 */
export function TeamChartsLazy(props: ComponentProps<typeof Charts>) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  return <div ref={ref} style={seen ? undefined : { minHeight: 1500 }}>{seen ? <TeamCharts {...props} /> : null}</div>;
}
