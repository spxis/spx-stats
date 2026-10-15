"use client";

import { Fragment, useSyncExternalStore } from "react";
import { localText, splitMarks, utcText, utcTitle, type TimeStyle } from "@/lib/localTime";
import { useSpeaker } from "./i18n/LocaleProvider";

const never = () => () => {};

/**
 * A time shown in the reader's own time zone and language. The server (and the first render in the browser) draws the UTC form, so the
 * two agree and nothing mismatches; the browser then swaps in the local form. The tooltip always holds the UTC value. `dateTime` is the
 * machine value.
 */
export function LocalTime({ iso, style = "stamp" }: { iso: string | null | undefined; style?: TimeStyle }) {
  const { locale } = useSpeaker();
  const text = useSyncExternalStore(
    never,
    () => localText(iso, style, locale) ?? "–",
    () => utcText(iso, style) ?? "–",
  );
  return <time dateTime={utcText(iso) ? new Date(Date.parse(iso as string)).toISOString() : undefined} title={utcTitle(iso)}>{text}</time>;
}

/** A sentence whose times are marks (lib/localTime.ts `mark`): each mark is drawn as a <LocalTime>, the rest is plain. */
export function Stamped({ text }: { text: string }) {
  return (
    <>
      {splitMarks(text).map((piece, i) => (typeof piece === "string" ? <Fragment key={i}>{piece}</Fragment> : <LocalTime key={i} iso={piece.iso} style={piece.style} />))}
    </>
  );
}
