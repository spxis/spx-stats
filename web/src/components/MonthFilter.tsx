"use client";

import { atUtc } from "@/lib/format";
import { DatePicker } from "./DatePicker";
import { useSpeaker } from "./i18n/LocaleProvider";
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
  const { say, dt } = useSpeaker();
  const fmt = months.length > 12 ? dt.monYear : dt.mon;
  return (
    <div className="filters" role="group" aria-label={say("filter.month")}>
      <div className="monthchips">
        <button type="button" aria-pressed={month === ""} onClick={() => onMonth("")}>{say("filter.all")}</button>
        {months.map((m) => <button key={m} type="button" aria-pressed={m === month} onClick={() => onMonth(m)}>{fmt(atUtc(`${m}-01`))}</button>)}
      </div>
      {days.size ? (
        <DatePicker label={say("filter.jumpDate")} value={day ?? ""} min={[...days].sort()[0]} max={[...days].sort().at(-1) as string} marked={days}
          placeholder={say("filter.pickDate")} onChange={onDay} />
      ) : null}
    </div>
  );
}
