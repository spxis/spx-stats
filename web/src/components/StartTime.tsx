"use client";

import { useSyncExternalStore } from "react";
import { localText } from "@/lib/localTime";
import { startStyle } from "@/lib/startTime";
import { useSpeaker } from "./i18n/LocaleProvider";

const never = () => () => {};

/**
 * A scheduled start in the reader's own zone and language. The server draws nothing: it does not know that zone, and a UTC
 * time would be the wrong clock. The browser fills in the local time, and adds the date when that zone puts the game on
 * another day from the one the scoreboard is showing.
 */
export function StartTime({ iso, gameDate }: { iso: string; gameDate: string }) {
  const { locale } = useSpeaker();
  const text = useSyncExternalStore(
    never,
    () => localText(iso, startStyle(iso, gameDate), locale) ?? "",
    () => "",
  );
  if (!text) return null;
  return <time dateTime={new Date(Date.parse(iso)).toISOString()}>{text}</time>;
}
