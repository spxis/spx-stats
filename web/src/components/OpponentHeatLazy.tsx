"use client";

import { opponentsRestPath } from "@/lib/opponentHeatPath";
import type { OpponentHeatView } from "@/lib/opponentHeat";
import { useSpeaker } from "./i18n/LocaleProvider";
import { OpponentHeat } from "./OpponentHeat";
import { useFetchedJson } from "./useFetchedJson";
import { useSeen } from "./useSeen";

/**
 * The body of a team page's "Record against each opponent" section, fetched when the reader gets near it. The page carries the heading and one
 * sentence; the chart (a square for every opponent and season) and its data are one kept JSON answer per franchise. While the database view behind it
 * is missing, or the database is busy, the section says it could not load.
 */
export function OpponentHeatLazy({ teamPath }: { teamPath: string }) {
  const { say } = useSpeaker();
  const [ref, seen] = useSeen<HTMLDivElement>();
  const { state, data } = useFetchedJson<OpponentHeatView>(opponentsRestPath(teamPath), "view", seen);
  if (data) return <OpponentHeat view={data} />;
  return (
    <div ref={ref} id="opponents" style={{ minHeight: state === "failed" ? undefined : 420 }}>
      {state === "loading" ? <p className="note" role="status">{say("load.loading")}</p> : null}
      {state === "failed" ? <p className="note" role="status">{say("load.failed")}</p> : null}
    </div>
  );
}
