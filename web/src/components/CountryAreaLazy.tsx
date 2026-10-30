"use client";

import dynamic from "next/dynamic";
import type { Stack } from "@/lib/countryModel";
import { useSeen } from "./useSeen";

const CountryArea = dynamic(() => import("./CountryArea").then((m) => m.CountryArea), { ssr: false });

/** The height of the stacked chart, its mode buttons and its legend before they are drawn, so the page below does not jump. */
const AREA_HEIGHT = 340;

/**
 * The stacked chart of a league's players by country over the seasons, drawn in the browser when the reader gets near it. It is a drawing with no words a
 * search needs (the table under it, and the season pages, hold the same figures), and its hundred or so curves were over 100 KB of markup for a league
 * with a long history.
 */
export function CountryAreaLazy({ stack, league, label, tableLabel }: { stack: Stack; league: string; label: string; tableLabel: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <div ref={ref} style={seen ? undefined : { minHeight: AREA_HEIGHT }}>
      {seen ? <CountryArea stack={stack} league={league} label={label} tableLabel={tableLabel} table={false} /> : null}
    </div>
  );
}
