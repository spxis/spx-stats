"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { seasonPath } from "@/lib/slug";
import { hrefWith } from "@/lib/urlQuery";
import { DatePicker } from "./DatePicker";
import { useSpeaker } from "./i18n/LocaleProvider";

interface Props {
  lg: string;
  year: number;
  /** Every season of the league, newest first. */
  seasons: { year: number; label: string }[];
  /** Days with a regular-season game, ascending. */
  days: string[];
  /** The date standings are shown as of, or "" for the final table. */
  date: string;
}

/**
 * The season page's header controls: a season picker (the league's every season) and a date button that opens a month
 * calendar. Choosing a date shows the standings as of that day (?date=); the address keeps the view and the sort.
 */
export function SeasonBar({ lg, year, seasons, days, date }: Props) {
  const { say } = useSpeaker();
  const router = useRouter();
  const marked = useMemo(() => new Set(days), [days]);
  return (
    <div className="controls seasonbar">
      <label className="seasonpick">
        <select aria-label={say("col.season")} value={year} onChange={(e) => {
          const q = new URLSearchParams(location.search);
          for (const k of ["date", "all", "team", "month", "day", "phase"]) q.delete(k);
          const s = q.toString();
          router.push(`${seasonPath(lg, Number(e.target.value))}${s ? `?${s}` : ""}`);
        }}>
          {seasons.map((s) => <option key={s.year} value={s.year}>{s.label}</option>)}
        </select>
      </label>
      {days.length ? (
        <DatePicker label={say("bar.dateLabel")} value={date} min={days[0]} max={days[days.length - 1]} marked={marked}
          placeholder={say("bar.datePlaceholder")}
          onChange={(d) => router.push(hrefWith({ date: d || null }), { scroll: false })} />
      ) : null}
    </div>
  );
}
