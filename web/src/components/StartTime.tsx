"use client";

import { useSyncExternalStore } from "react";
import { localText, utcText, utcTitle } from "@/lib/localTime";
import { startStyle } from "@/lib/startTime";
import { useSpeaker } from "./i18n/LocaleProvider";

const never = () => () => {};

/**
 * A scheduled start in the reader's zone and language. The server draws UTC. The browser then uses the reader's zone, and
 * adds the date when that zone puts the game on a different day from the one the scoreboard is showing.
 */
export function StartTime({ iso, gameDate }: { iso: string; gameDate: string }) {
  const { locale } = useSpeaker();
  const text = useSyncExternalStore(
    never,
    () => localText(iso, startStyle(iso, gameDate), locale) ?? "–",
    () => utcText(iso, startStyle(iso, gameDate, "UTC")) ?? "–",
  );
  return <time dateTime={new Date(Date.parse(iso)).toISOString()} title={utcTitle(iso)}>{text}</time>;
}
