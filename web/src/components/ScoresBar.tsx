"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useSyncExternalStore } from "react";
import { localToday } from "@/lib/format";
import { scoresPath } from "@/lib/scores";
import { seasonLabel } from "@/lib/leagues";
import { DatePicker } from "./DatePicker";
import { useSpeaker } from "./i18n/LocaleProvider";
import "./datepicker.css";
import "./scores.css";

interface Props {
  lg: string;
  day: string;
  /** The season the day belongs to (selected in the picker), and every season with games, newest first. */
  year: number | null;
  seasons: number[];
  /** The days with a game in that season (they carry a dot), and the league's first and last game day. */
  days: string[];
  min: string;
  max: string;
  /** The days before and after, or "" where the league has none. */
  prev: string;
  next: string;
  prevText: string;
  nextText: string;
}

/**
 * The scoreboard's controls: the season, the day before and the day after, a date picker and a Today button.
 * Every choice is an address (/nhl/scores/2023-04-15; a season is /nhl/scores?season=2022-23), so the back button works.
 */
export function ScoresBar({ lg, day, year, seasons, days, min, max, prev, next, prevText, nextText }: Props) {
  const { say } = useSpeaker();
  const router = useRouter();
  const marked = useMemo(() => new Set(days), [days]);
  const today = useSyncExternalStore(() => () => {}, localToday, () => "");
  return (
    <div className="controls seasonbar scoresbar">
      <label className="seasonpick">
        <select aria-label={say("col.season")} value={year ?? ""} onChange={(e) => router.push(`${scoresPath(lg)}?season=${seasonLabel(lg, Number(e.target.value))}`)}>
          {year == null ? <option value="" /> : null}
          {seasons.map((y) => <option key={y} value={y}>{seasonLabel(lg, y)}</option>)}
        </select>
      </label>
      <span className="daynav">
        {prev ? <Link href={scoresPath(lg, prev)} rel="prev" prefetch={false} className="dayarrow">{"← " + prevText}</Link> : <span className="dayarrow off" aria-hidden="true">{"← " + prevText}</span>}
        {next ? <Link href={scoresPath(lg, next)} rel="next" prefetch={false} className="dayarrow">{nextText + " →"}</Link> : <span className="dayarrow off" aria-hidden="true">{nextText + " →"}</span>}
      </span>
      <DatePicker label={say("scores.dateLabel")} value={day} min={min} max={max} marked={marked} placeholder={say("filter.pickDate")}
        onChange={(d) => router.push(scoresPath(lg, d || undefined))} />
      <button type="button" className="todaybtn" disabled={!today} onClick={() => router.push(scoresPath(lg, today))}>{say("picker.today")}</button>
    </div>
  );
}
