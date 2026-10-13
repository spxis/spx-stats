"use client";

import dynamic from "next/dynamic";
import { useSpeaker } from "./i18n/LocaleProvider";

function Loading() {
  const { say } = useSpeaker();
  return <div className="pcharts-loading" role="status">{say("board.chartsLoading")}</div>;
}

/**
 * The player's charts, fetched when a player page is opened and drawn in the browser only: the chart code (d3's scales, arcs and lines) is in
 * its own chunk, so no other page pays for it, and the page's own HTML stays small. They redraw from the board's data as the range moves.
 */
export const PlayerCharts = dynamic(() => import("./PlayerCharts"), { ssr: false, loading: () => <Loading /> });
