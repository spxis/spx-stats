/**
 * What a bracket's group buttons and its "today" marker need to know about each tie, worked out in the browser from a little data the page sends (components/BracketFocus.tsx).
 * The bracket itself is a cached SVG file (app/bracket-svg), the same for everyone, so neither a preview nor "today" can be in it. A tie is told apart by its link, and the page
 * hands over, per tie, the groups its clubs belong to and the days its games fall on. Pure, so the logic is tested (scripts/bracketGroups.test.ts).
 */

/** One tie of a bracket: its link (the box's `href`), the groups a club of it sits in (`conf:<key>`, `div:<key>`), the days of its games (YYYY-MM-DD) and whether a division preview always keeps it (the final). */
export interface BracketMark {
  h: string;
  g?: readonly string[];
  d?: readonly string[];
  keep?: boolean;
}

/** A group button's value: the half of one conference, or one division. */
export const confGroup = (key: string) => `conf:${key}`;
export const divGroup = (key: string) => `div:${key}`;

/**
 * The links of the ties a click on `group` would fade: those with no club of the group. "" is the button for everything, which fades nothing. Like the chosen
 * division's own fade, the final is kept for a division; a conference's half is a bracket of its own, so the final fades with the other half.
 */
export function fadedBy(marks: readonly BracketMark[], group: string): Set<string> {
  const out = new Set<string>();
  if (!group) return out;
  const isDiv = group.startsWith("div:");
  for (const m of marks) {
    if (isDiv && m.keep) continue;
    if (!m.g?.includes(group)) out.add(m.h);
  }
  return out;
}

/** The day a page counts as "today": the day the address asks for (?date=, a YYYY-MM-DD), else the reader's own day. */
export function contextDay(asked: string | null | undefined, now: Date): string {
  return asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : localDay(now);
}

/** The reader's calendar day, YYYY-MM-DD, in the browser's own time zone. */
export function localDay(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** The links of the ties with a game on `day`. */
export function playingOn(marks: readonly BracketMark[], day: string): Set<string> {
  return new Set(marks.filter((m) => m.d?.includes(day)).map((m) => m.h));
}
