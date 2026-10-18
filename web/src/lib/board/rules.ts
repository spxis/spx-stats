/**
 * The ticket board's rules, in the board's own words (open, inProgress, done,
 * dropped; feature, fix, chore). Contract: Sumilabu's BOARD_RULES.md, the same
 * one UmaKuma and Itsutsu follow. Pure, so the CLI and the page share it.
 */

export const BOARD_STATUSES = ["open", "inProgress", "done", "dropped"] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];
export const BOARD_KINDS = ["feature", "fix", "chore"] as const;
export type BoardKind = (typeof BOARD_KINDS)[number];
export const BOARD_PRIORITIES = ["high", "normal", "low"] as const;
export type BoardPriority = (typeof BOARD_PRIORITIES)[number];
export const BOARD_EFFORTS = ["small", "medium", "large"] as const;
export type BoardEffort = (typeof BOARD_EFFORTS)[number];

/** A ticket as the board returns it. */
export type Ticket = {
  id: string;
  /** Present once Sumilabu has short ids (SPX-142); absent on an older Sumilabu. */
  shortId?: string | null;
  projectKey: string;
  title: string;
  detail: string | null;
  area: string | null;
  kind: string;
  status: BoardStatus;
  priority: BoardPriority | null;
  effort: BoardEffort | null;
  askedBy: string | null;
  claimedBy: string | null;
  claimedAt: string | null;
  heldNow: boolean;
  releasedIn: string | null;
  releasedEntry: string | null;
  releasedAt: string | null;
  createdAt: string;
  movedAt: string;
};

/** Invariant 3: a hold lasts six hours without renewal. */
export const LEASE_MS = 6 * 60 * 60 * 1000;

export function leaseExpired(claimedAt: string | null | undefined, nowMs = Date.now()): boolean {
  if (!claimedAt) return true;
  const held = Date.parse(claimedAt);
  return !Number.isFinite(held) || nowMs - held > LEASE_MS;
}

export function isHeldNow(row: { claimedBy: string | null; claimedAt?: string | null }, nowMs = Date.now()): boolean {
  return typeof row.claimedBy === "string" && row.claimedBy.trim().length > 0 && !leaseExpired(row.claimedAt ?? null, nowMs);
}

/** Invariant 6: the caps, refused here in words before the board refuses them. */
export const CAPS = { titleMin: 8, titleMax: 120, detail: 4000, askedBy: 60, claimedBy: 80 } as const;

export function draftProblems(draft: { title: string; detail: string; askedBy: string }): string[] {
  const problems: string[] = [];
  const title = draft.title.trim();
  if (title.length < CAPS.titleMin) problems.push(`Say what is wanted in at least ${CAPS.titleMin} characters.`);
  if (title.length > CAPS.titleMax) problems.push(`A title is at most ${CAPS.titleMax} characters; the rest belongs in the detail.`);
  if (draft.detail.length > CAPS.detail) problems.push("The detail is at most 4,000 characters.");
  if (draft.askedBy.trim().length > CAPS.askedBy) problems.push(`A name is at most ${CAPS.askedBy} characters.`);
  return problems;
}

/** Text like SPX-142: what the board calls a short id. A cuid has no hyphen, so the two never look alike. */
export function looksLikeShortId(text: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]*-[1-9][0-9]*$/.test(text.trim());
}

/** The words an edit would leave, refused in words before the board refuses them (the same caps as a draft). Null means leave as is. */
export function editProblems(edit: { title?: string | null; detail?: string | null }): string[] {
  const problems: string[] = [];
  if (edit.title != null) {
    const title = edit.title.trim();
    if (title.length < CAPS.titleMin) problems.push(`Say what is wanted in at least ${CAPS.titleMin} characters.`);
    if (title.length > CAPS.titleMax) problems.push(`A title is at most ${CAPS.titleMax} characters; the rest belongs in the detail.`);
  }
  if (edit.detail != null && edit.detail.length > CAPS.detail) problems.push(`The detail is at most ${CAPS.detail.toLocaleString("en-US")} characters.`);
  return problems;
}

/** --append: the new text goes after the old detail, a blank line between; nothing to separate when there was no detail. */
export function appendedDetail(current: string | null, addition: string): string {
  const text = addition.trim();
  return current && current.trim() ? `${current.trimEnd()}\n\n${text}` : text;
}

/** Invariant 7: priority descending, effort ascending, newest move first; ungraded last on both. */
function rank<T extends string>(order: readonly T[], value: T | null): number {
  return value === null ? order.length : order.indexOf(value);
}
export function byQuickWin(a: Ticket, b: Ticket): number {
  return (
    rank(BOARD_PRIORITIES, a.priority) - rank(BOARD_PRIORITIES, b.priority) ||
    rank(BOARD_EFFORTS, a.effort) - rank(BOARD_EFFORTS, b.effort) ||
    b.movedAt.localeCompare(a.movedAt)
  );
}

/** Who has it, in words; a lapsed hold is said to be stale, not waiting. */
export function holdLabel(t: Ticket, nowMs = Date.now()): string {
  if (!t.claimedBy) return "waiting";
  return isHeldNow(t, nowMs) ? `held by ${t.claimedBy}` : `stale hold: ${t.claimedBy}`;
}

export function ticketLine(t: Ticket, nowMs = Date.now()): string {
  const grade = [t.priority && `P:${t.priority}`, t.effort && `E:${t.effort}`].filter(Boolean).join(" ");
  return `${t.shortId ? `${t.shortId.padEnd(8)} ` : ""}${t.id}  ${t.kind === "fix" ? "FIX " : "    "} ${holdLabel(t, nowMs).padEnd(30)} ${grade.padEnd(16)} ${t.title}`;
}
