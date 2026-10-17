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
 * The body of a team's results graph, fetched after first paint (or when the reader gets near it). The page carries
 * the heading and one sentence; the packed games are one kept JSON answer per franchise.
 */
export function ResultHeatLazy({ teamPath, lg, lock, eager = false, compact = false }: {
  teamPath: string; lg: string; lock?: "all"; eager?: boolean; compact?: boolean;
}) {
  const { say } = useSpeaker();
  const [ref, seen] = useSeen<HTMLDivElement>();
  const { state, data } = useFetchedJson<PackedHeat>(resultsRestPath(teamPath), "view", eager || seen);
  const games = useMemo(() => (data ? unpackHeat(data) : []), [data]);
  if (data) return <ResultHeat lg={lg} games={games} lock={lock} compact={compact} />;
  return (
    <div ref={ref} className="rheat-lazy" id={eager ? undefined : "results-calendar"} style={{ minHeight: state === "failed" ? undefined : 160 }}>
      {state === "loading" || (eager && state === "idle") ? <p className="note" role="status">{say("load.loading")}</p> : null}
      {state === "failed" ? <p className="note" role="status">{say("load.failed")}</p> : null}
    </div>
  );
}
