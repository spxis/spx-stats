"use client";

import Link from "@/components/Link";
import { useSyncExternalStore } from "react";
import { localToday } from "@/lib/format";
import { stripDates, usHolidayDates, weekDirection, type HolidayKey, type StripLayout } from "@/lib/weekStrip";
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
 * The shared seven-day strip for a league's scores page (days link to their scoreboard) and a season page (buttons select that day's games). It shows a
 * calendar week by default, with an explicit centered `dynamic` layout for other callers. The chosen day is marked `aria-current="date"`; today comes from
 * the reader's browser clock, so the kept pages stay date-independent. `jump` links or `onWeekChange` buttons move exactly seven days.
 */
export function DayStrip({ days, current, aria, onPick, jump, layout = "fixed", weekStartsOn = 0, holidays, shadeWeekends = true, shadeHolidays = true, onWeekChange }: {
  days: StripDay[];
  current: string;
  aria: string;
  onPick?: (day: string) => void;
  jump?: StripJump;
  layout?: StripLayout;
  weekStartsOn?: number;
  /** Custom holiday labels keyed by ISO date. Omit for US federal holidays, or pass false to omit holidays. */
  holidays?: Readonly<Record<string, string>> | false;
  shadeWeekends?: boolean;
  shadeHolidays?: boolean;
  onWeekChange?: (direction: "back" | "forward") => void;
}) {
  const { say } = useSpeaker();
  const today = useSyncExternalStore(subscribe, localToday, () => "");
  const start = weekDirection(current, today, weekStartsOn);
  const todayArrow = start === "past" ? "forward" : start === "future" ? "back" : null;
  const keys = stripDates(current, layout, weekStartsOn);
  const source = new Map(days.map((d) => [d.key, d]));
  const visible = keys.map((key) => source.get(key) ?? { key, weekday: "", date: key, games: 0, word: "", label: key });
  const holidayMap = holidays === false ? new Map<string, string>() : holidays ? new Map(Object.entries(holidays)) : new Map(
    [...usHolidayDates([...new Set(keys.map((d) => Number(d.slice(0, 4))))].flatMap((year) => [year - 1, year, year + 1]))]
      .map(([date, key]) => [date, say(key as HolidayKey)]),
  );
  const arrow = (dir: "back" | "forward", href: string | undefined) => {
    const label = say(dir === "back" ? "scores.weekBack" : "scores.weekForward");
    const marked = todayArrow === dir;
    const aria = marked ? `${label} (${say(dir === "forward" ? "scores.todayLater" : "scores.todayEarlier")})` : label;
    const className = "jump" + (marked ? " has-today" : "");
    const inside = <><Chevrons dir={dir} />{marked ? <span className="jump-today">{say("scores.todayMark")}</span> : null}</>;
    if (href) return <Link href={href} rel={dir === "back" ? "prev" : "next"} prefetch={false} className={className} aria-label={aria} title={aria}>{inside}</Link>;
    if (onWeekChange) return <button type="button" className={className} aria-label={aria} title={aria} onClick={() => onWeekChange(dir)}>{inside}</button>;
    return <span className="jump off" aria-hidden="true"><Chevrons dir={dir} /></span>;
  };
  return (
    <nav className={"daystrip" + (jump || onWeekChange ? " withjump" : "")} aria-label={aria}>
      {jump || onWeekChange ? arrow("back", jump?.back) : null}
      {visible.map((d) => {
        const inside = (
          <>
            <span className="wd">{d.weekday}</span>
            <span className="md">{d.date}</span>
            {d.games ? <span className="ct"><b>{d.games}</b><span className="cw">{d.word}</span></span> : <span className="ct none" aria-hidden="true">–</span>}
          </>
        );
        const on = d.key === current ? "date" : undefined;
        const isToday = d.key === today ? "" : undefined;
        const holiday = holidayMap.get(d.key);
        const weekday = new Date(`${d.key}T00:00:00Z`).getUTCDay();
        const weekend = weekday === 0 || weekday === 6;
        const label = [d.label, shadeWeekends && weekend ? say("scores.weekend") : null, holiday && shadeHolidays ? holiday : null,
          isToday !== undefined ? say("scores.todayMark") : null].filter(Boolean).join("; ");
        const className = [d.games ? "has" : "", shadeWeekends && weekend ? "weekend" : "", shadeHolidays && holiday ? "holiday" : ""].filter(Boolean).join(" ") || undefined;
        return d.href && !onPick
          ? <Link key={d.key} href={d.href} prefetch={false} className={className} aria-current={on} data-today={isToday} data-weekend={shadeWeekends && weekend ? "" : undefined} data-holiday={shadeHolidays && holiday ? "" : undefined} title={holiday && shadeHolidays ? holiday : undefined} aria-label={label}>{inside}{isToday !== undefined && start === "current" ? <span className="nowmark">{say("scores.nowMark")}</span> : null}</Link>
          : <button key={d.key} type="button" className={className} aria-current={on} data-today={isToday} data-weekend={shadeWeekends && weekend ? "" : undefined} data-holiday={shadeHolidays && holiday ? "" : undefined} title={holiday && shadeHolidays ? holiday : undefined} aria-label={label} onClick={() => onPick?.(d.key)}>{inside}{isToday !== undefined && start === "current" ? <span className="nowmark">{say("scores.nowMark")}</span> : null}</button>;
      })}
      {jump || onWeekChange ? arrow("forward", jump?.forward) : null}
    </nav>
  );
}
