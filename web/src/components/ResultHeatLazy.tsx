"use client";

import { useMemo } from "react";
import type { PackedHeat } from "@/lib/resultHeat";
import { unpackHeat } from "@/lib/resultHeat";
import { resultsRestPath } from "@/lib/resultHeatPath";
import { ResultHeat } from "./ResultHeat";
import { useSpeaker } from "./i18n/LocaleProvider";
import { useFetchedJson } from "./useFetchedJson";
import { useSeen } from "./useSeen";

/**
 * The body of a team page's results calendar, fetched when the reader gets near it. The page carries the heading
 * and one sentence; the squares and the packed games are one kept JSON answer per franchise.
 */
export function ResultHeatLazy({ teamPath, lg }: { teamPath: string; lg: string }) {
  const { say } = useSpeaker();
  const [ref, seen] = useSeen<HTMLDivElement>();
  const { state, data } = useFetchedJson<PackedHeat>(resultsRestPath(teamPath), "view", seen);
  const games = useMemo(() => (data ? unpackHeat(data) : []), [data]);
  if (data) return <ResultHeat lg={lg} games={games} />;
  return (
    <div ref={ref} id="results-calendar" style={{ minHeight: state === "failed" ? undefined : 220 }}>
      {state === "loading" ? <p className="note" role="status">{say("load.loading")}</p> : null}
      {state === "failed" ? <p className="note" role="status">{say("load.failed")}</p> : null}
    </div>
  );
}
