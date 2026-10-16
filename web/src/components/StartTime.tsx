"use client";

import { useSyncExternalStore } from "react";
import { startLabel } from "@/lib/startTime";
import { useSpeaker } from "./i18n/LocaleProvider";

const never = () => () => {};

/**
 * A scheduled start in the reader's own zone and language. The server draws nothing: it does not know that zone, and a UTC
 * time would be the wrong clock. The browser fills in the local time when that zone puts the instant on the scoreboard's
 * date, and a short date plus the time when it falls on another day.
 */
export function StartTime({ iso, gameDate }: { iso: string; gameDate: string }) {
  const { locale } = useSpeaker();
  const text = useSyncExternalStore(
    never,
    () => startLabel(iso, gameDate, locale, Intl.DateTimeFormat().resolvedOptions().timeZone) ?? "",
    () => "",
  );
  if (!text) return null;
  return <time dateTime={new Date(Date.parse(iso)).toISOString()}>{text}</time>;
}
