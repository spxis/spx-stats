"use client";

import { useSyncExternalStore } from "react";
import { LibCredit } from "@/components/Credits";
import Link from "@/components/Link";
import { useFetchedJson } from "@/components/useFetchedJson";
import { Rich } from "@/components/i18n/Rich";
import { useSpeaker } from "@/components/i18n/LocaleProvider";
import { leagueInfo } from "@/lib/leagues";
import { playerPath } from "@/lib/playerPath";
import { sourceLabel } from "@/lib/sourceLabels";
import { newestFirst } from "@/lib/todayHistory/order";
import type { HistoryDay, HistoryFact } from "@/lib/todayHistory/types";

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

function Line({ f, labelled }: { f: HistoryFact; labelled: boolean }) {
  return (
    <li>
      <span className="hist-y">{f.y}</span>
      {labelled ? <span className="hist-l">{leagueInfo(f.l)?.short ?? f.l.toUpperCase()}</span> : null}
      <span>
        {f.p && f.n ? <><Link href={playerPath(f.l, f.p, f.t.slice(0, f.n))}>{f.t.slice(0, f.n)}</Link>{f.t.slice(f.n)}</> : f.t}
      </span>
    </li>
  );
}

/**
 * "Today in {sport} history" (hockey, basketball, baseball, football; the sport word is the league family's own, `league.sport.*`) on a league's home page: the calendar page of the reader's own day and up to three facts of that day, taken from the sport's history (every league of the sport, each line labelled with its league when there is more than one: football shows the NFL and the CFL together).
 * The page it sits on is kept for everyone and holds none of this: the server draws only an empty frame of the block's height (so the row below never jumps), and the browser works out its own day, asks for that day's small kept file
 * (`/<host league>/rows/today/MM-DD`, lib/todayHistory: one file a day for the whole sport) and draws the block, newest year first. A day with no fact for the sport takes the frame away: the champion beside it has the whole row.
 */
export function TodayInHistory({ host, sport, labelled }: { host: string; sport: string; labelled: boolean }) {
  const { say } = useSpeaker();
  // The server and the first browser render are both `null` (no hydration difference); the reader's day follows at once.
  const day = useSyncExternalStore(subscribe, () => localDay(), () => null);
  const { state, data } = useFetchedJson<HistoryDay>(`/${host}/rows/today/${day}`, "day", day !== null);
  // Until the day's lines are here, the block is a frame of the height it will have (the row below must not jump when they arrive); a day with no lines takes the frame away.
  if (state === "empty" || state === "failed") return null;
  if (state !== "done" || !data || !data.facts.length) return <section className="hist hist-wait" aria-hidden="true" />;
  const facts = newestFirst(data.facts);
  const list = [...new Set(facts.map((f) => f.s))].map(credit).join(", ");
  return (
    <section className="hist" aria-labelledby="hist-title">
      <div className="hist-head">
        <span className="hist-cal" aria-hidden="true" dangerouslySetInnerHTML={{ __html: data.icon }} />
        <h2 id="hist-title" className="hist-title">{say("history.title", { sport })}</h2>
      </div>
      <ul className="hist-list">{facts.map((f) => <Line key={`${f.l}-${f.y}-${f.t}`} f={f} labelled={labelled} />)}</ul>
      <p className="note hist-src">{say("history.sources", { list })} <Rich text={say("history.credit")} parts={{ meigen: <LibCredit lib="meigen-sports" />, koyomi: <LibCredit lib="koyomi-calendars" /> }} /></p>
    </section>
  );
}
