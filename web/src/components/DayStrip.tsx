"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { localToday } from "@/lib/format";
import { useSpeaker } from "./i18n/LocaleProvider";
import "./scores.css";

/** One cell of the week strip: the weekday and date, how many games the day held, and where it leads (a link) or nothing (a button the page handles). */
export interface StripDay {
  /** The day, as 2026-10-14. */
  key: string;
  weekday: string;
  date: string;
  games: number;
  /** "game" or "games", as the language has it, written next to the count when there is room. */
  word: string;
  /** The whole description for a screen reader, such as "Wednesday, October 14, 2026: 5 games". */
  label: string;
  href?: string;
}

/** Where a week jump leads: the address of the day seven days away, or "" when there is no such day (the button is then shown but off). */
export interface StripJump { back: string; forward: string }

const subscribe = () => () => {};

const Chevrons = ({ dir }: { dir: "back" | "forward" }) => (
  <svg width="14" height="16" viewBox="0 0 14 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true" focusable="false">
    {dir === "back" ? <path d="M7 3 2 8l5 5M12 3 7 8l5 5" /> : <path d="M2 3l5 5-5 5M7 3l5 5-5 5" />}
  </svg>
);

/**
 * The strip of seven days with an "N games" badge under each date, shared by a league's scores page (every day a link to its scoreboard) and a season page
 * (every day a button: the page shows that day's games in place). The cell for the chosen day is marked `aria-current="date"`; the cell for today, on the
 * reader's own clock (known only in the browser, so the pages around it stay kept), carries `data-today` and "today" in its spoken label.
 * `jump` adds a narrow double-chevron link at each end that moves the chosen day back or forward by exactly seven days (the scores page only).
 */
export function DayStrip({ days, current, aria, onPick, jump }: { days: StripDay[]; current: string; aria: string; onPick?: (day: string) => void; jump?: StripJump }) {
  const { say } = useSpeaker();
  const today = useSyncExternalStore(subscribe, localToday, () => "");
  const arrow = (dir: "back" | "forward", href: string) => {
    const label = say(dir === "back" ? "scores.weekBack" : "scores.weekForward");
    return href
      ? <Link href={href} prefetch={false} className="jump" aria-label={label} title={label}><Chevrons dir={dir} /></Link>
      : <span className="jump off" aria-hidden="true"><Chevrons dir={dir} /></span>;
  };
  return (
    <nav className={"daystrip" + (jump ? " withjump" : "")} aria-label={aria}>
      {jump ? arrow("back", jump.back) : null}
      {days.map((d) => {
        const inside = (
          <>
            <span className="wd">{d.weekday}</span>
            <span className="md">{d.date}</span>
            {d.games ? <span className="ct"><b>{d.games}</b><span className="cw">{d.word}</span></span> : <span className="ct none" aria-hidden="true">–</span>}
          </>
        );
        const on = d.key === current ? "date" : undefined;
        const isToday = d.key === today ? "" : undefined;
        const label = isToday === undefined ? d.label : `${d.label} (${say("scores.todayMark")})`;
        return d.href && !onPick
          ? <Link key={d.key} href={d.href} prefetch={false} className={d.games ? "has" : undefined} aria-current={on} data-today={isToday} aria-label={label}>{inside}</Link>
          : <button key={d.key} type="button" className={d.games ? "has" : undefined} aria-current={on} data-today={isToday} aria-label={label} onClick={() => onPick?.(d.key)}>{inside}</button>;
      })}
      {jump ? arrow("forward", jump.forward) : null}
    </nav>
  );
}
