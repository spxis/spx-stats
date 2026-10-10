"use client";

import { atUtc, utc } from "@/lib/format";
import { DatePicker } from "./DatePicker";
import "./team.css";

interface Props {
  /** The months that hold games (YYYY-MM), in order. */
  months: string[];
  /** The month filtering the list; "" is every month. */
  month: string;
  /** Every day with a game, for the calendar pop-up. */
  days: ReadonlySet<string>;
  day?: string;
  onMonth: (month: string) => void;
  /** A date picked in the pop-up: its month becomes the filter and the day is shown. */
  onDay: (day: string) => void;
}

/** The Month filter of a games list: All and one chip per month, and a button that opens a pop-up calendar to jump to a date. */
export function MonthFilter({ months, month, days, day, onMonth, onDay }: Props) {
  const fmt = months.length > 12 ? utc.monYear : utc.mon;
  return (
    <div className="filters" role="group" aria-label="Month">
      <div className="monthchips">
        <button type="button" aria-pressed={month === ""} onClick={() => onMonth("")}>All</button>
        {months.map((m) => <button key={m} type="button" aria-pressed={m === month} onClick={() => onMonth(m)}>{fmt(atUtc(`${m}-01`))}</button>)}
      </div>
      {days.size ? (
        <DatePicker label="Jump to a date" value={day ?? ""} min={[...days].sort()[0]} max={[...days].sort().at(-1) as string} marked={days}
          placeholder="Pick a date" onChange={onDay} />
      ) : null}
    </div>
  );
}
