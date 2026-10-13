"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { hrefWith } from "@/lib/urlQuery";
import { DatePicker } from "./DatePicker";
import { useSpeaker } from "./i18n/LocaleProvider";

interface Props {
  /** Days with a regular-season game, ascending. */
  days: string[];
  /** The date standings are shown as of, or "" for the final table. */
  date: string;
}

/**
 * The season page's date button, which opens a month calendar. Choosing a date shows the standings as of that day (?date=); the
 * address keeps the view and the sort. (The season picker is in the header's SeasonNav, between the arrows.)
 */
export function SeasonBar({ days, date }: Props) {
  const { say } = useSpeaker();
  const router = useRouter();
  const marked = useMemo(() => new Set(days), [days]);
  if (!days.length) return null;
  return (
    <div className="controls seasonbar">
      <DatePicker label={say("bar.dateLabel")} value={date} min={days[0]} max={days[days.length - 1]} marked={marked}
        placeholder={say("bar.datePlaceholder")}
        onChange={(d) => router.push(hrefWith({ date: d || null }), { scroll: false })} />
    </div>
  );
}
