import { LOCALE_TAG, type Locale } from "./locale.ts";

/**
 * Times on the admin pages are machine times (an ISO string from the database, always UTC) that the reader's browser shows in the
 * reader's own time zone and language. The server cannot know either, so it draws the UTC form and the browser swaps it
 * (components/LocalTime.tsx). Pure helpers, shared by both sides and by the tests.
 *
 *   "clock"  the time of day            03:03 UTC       →  11:03 PM EDT
 *   "stamp"  the day and the time       2026-10-15 03:03 UTC  →  Oct 14, 2026, 11:03 PM EDT
 */
export type TimeStyle = "clock" | "stamp";

const parse = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/** "2026-10-15 03:03 UTC" or "03:03 UTC": what the server draws, and the tooltip of every time. Null when the value is not a time. */
export function utcText(iso: string | null | undefined, style: TimeStyle = "stamp"): string | null {
  const t = parse(iso);
  if (t === null) return null;
  const text = new Date(t).toISOString();
  return `${style === "clock" ? text.slice(11, 16) : `${text.slice(0, 10)} ${text.slice(11, 16)}`} UTC`;
}

/** The tooltip: the full UTC value, whatever the style. */
export const utcTitle = (iso: string | null | undefined): string | undefined => utcText(iso, "stamp") ?? undefined;

/** The time in the reader's zone (`timeZone` undefined means the browser's) and language, with the zone's short name. Null when not a time. */
export function localText(iso: string | null | undefined, style: TimeStyle, locale: Locale, timeZone?: string): string | null {
  const t = parse(iso);
  if (t === null) return null;
  const options: Intl.DateTimeFormatOptions = style === "clock"
    ? { hour: "numeric", minute: "2-digit", timeZoneName: "short" }
    : { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" };
  try {
    return new Intl.DateTimeFormat(LOCALE_TAG[locale], { ...options, timeZone }).format(new Date(t));
  } catch {
    return utcText(iso, style);
  }
}

// ---------------------------------------------------------------------------------------------------- marks in text
// A sentence that holds a time (a phrase of the catalogue, a message from a server action) carries it as a mark, ⟦stamp|ISO⟧, so the
// text stays a plain string; <Stamped text=...> turns each mark into a <LocalTime>. A mark read as plain text is the UTC form.

const MARK = /⟦(clock|stamp)\|([^⟧|]*)⟧/g;

/** The mark for one time inside a sentence. A value that is not a time is "?" (a mark with nothing to show would be an empty gap). */
export function mark(iso: string | null | undefined, style: TimeStyle = "stamp"): string {
  const t = parse(iso);
  return t === null ? "?" : `⟦${style}|${new Date(t).toISOString()}⟧`;
}

export type TimePiece = string | { iso: string; style: TimeStyle };

/** A sentence split into its plain pieces and its times. */
export function splitMarks(text: string): TimePiece[] {
  const out: TimePiece[] = [];
  let last = 0;
  for (const m of text.matchAll(MARK)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ iso: m[2] as string, style: m[1] as TimeStyle });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** The sentence with every mark written out in UTC: for tests, logs and anything that is not a page. */
export function plainMarks(text: string): string {
  return text.replace(MARK, (_whole, style: TimeStyle, iso: string) => utcText(iso, style) ?? "?");
}
