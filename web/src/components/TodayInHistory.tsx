"use client";

import { useSyncExternalStore } from "react";
import Link from "@/components/Link";
import { useFetchedJson } from "@/components/useFetchedJson";
import { useSpeaker } from "@/components/i18n/LocaleProvider";
import { playerPath } from "@/lib/playerPath";
import { sourceLabel } from "@/lib/sourceLabels";
import type { HistoryFact } from "@/lib/todayHistory/types";

/** "MM-DD" of the reader's own day, in the reader's own time zone. */
export const localDay = (now = new Date()): string => `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

/** The day changes only when the reader comes back to the tab (no timer runs): the browser tells us when it is shown again. */
function subscribe(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/** The licence a source states in a few characters ("CC0 1.0"); the longer notices (Retrosheet's) live in the footer. */
const credit = (code: string): string => {
  const { name, licence } = sourceLabel(code);
  return licence && licence.length <= 14 ? `${name} (${licence})` : name;
};

function Line({ league, f }: { league: string; f: HistoryFact }) {
  return (
    <li>
      <span className="hist-y">{f.y}</span>
      <span>
        {f.p && f.n ? <><Link href={playerPath(league, f.p, f.t.slice(0, f.n))}>{f.t.slice(0, f.n)}</Link>{f.t.slice(f.n)}</> : f.t}
      </span>
    </li>
  );
}

/**
 * "Today in {league} history" on a league's home page: the calendar page of the reader's own day and up to three facts of that day, taken from the league's history.
 * The page it sits on is kept for everyone and holds none of this: the server draws nothing, and the browser works out its own day, asks for that day's small kept file
 * (`/<league>/rows/today/MM-DD`, lib/todayHistory) and draws the block. A day with no fact for the league draws nothing at all, not an empty box.
 */
export function TodayInHistory({ league, short }: { league: string; short: string }) {
  const { say } = useSpeaker();
  // The server and the first browser render are both `null` (no hydration difference); the reader's day follows at once.
  const day = useSyncExternalStore(subscribe, () => localDay(), () => null);
  const { state, data } = useFetchedJson<{ icon: string; facts: HistoryFact[] }>(`/${league}/rows/today/${day}`, "day", day !== null);
  if (state !== "done" || !data || !data.facts.length) return null;
  const list = [...new Set(data.facts.map((f) => f.s))].map(credit).join(", ");
  return (
    <section className="hist" aria-labelledby="hist-title">
      <span className="hist-cal" aria-hidden="true" dangerouslySetInnerHTML={{ __html: data.icon }} />
      <div className="hist-body">
        <h2 id="hist-title" className="hist-title">{say("history.title", { league: short })}</h2>
        <ul className="hist-list">{data.facts.map((f) => <Line key={`${f.y}-${f.t}`} league={league} f={f} />)}</ul>
        <p className="note hist-src">{say("history.sources", { list })}</p>
      </div>
    </section>
  );
}
