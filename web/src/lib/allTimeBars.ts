import type { AllTimePhase } from "./allTime.ts";
import { lineAt, seasonsAt, shareAt, shownAt, type AtRow } from "./allTimeLines.ts";
import { fmt3 } from "./format.ts";
import { seasonLabel } from "./leagues.ts";
import type { TeamPaths } from "./slug.ts";

/** Which ranking a bar list shows. */
export type BarKind = "share" | "titles" | "playoffs";

/** A franchise with its bar, as RankBars draws it. */
export interface BarItem {
  key: number;
  name: string;
  abbr: string;
  href: string;
  logo: string | null;
  tl: string | null;
  td: string | null;
  value: number;
  text: string;
  tip: string;
  gone?: boolean;
}

/** The smallest number of seasons a franchise needs to be ranked by win share. */
export const MIN_SEASONS = 3;

/** What the words of a bar need: the reader's number formats and plurals, and the address of a team. */
export interface BarCtx {
  lg: string;
  phase: AllTimePhase;
  active: boolean;
  paths: TeamPaths;
  fmt: (n: number) => string;
  plural: (key: "count.seasons", n: number) => string;
}

const recText = (r: { w: number; l: number; t: number; otl: number }) => `${r.w}–${r.l}${r.t ? `–${r.t}` : ""}${r.otl ? `–${r.otl}` : ""}`;

/** The franchises of one ranking, best first (the order the bars were always drawn in). */
export function barRows(kind: BarKind, rows: readonly AtRow[], phase: AllTimePhase, active: boolean): AtRow[] {
  const shown = shownAt(rows, phase, active);
  const sharePh = (t: AtRow) => shareAt(t, phase);
  if (kind === "share") {
    const qualified = shown.filter((t) => seasonsAt(t, phase) >= MIN_SEASONS);
    const ranked = qualified.length >= 8 ? qualified : shown;
    return ranked.filter((t) => sharePh(t) != null).sort((a, b) => sharePh(b)! - sharePh(a)!);
  }
  if (kind === "titles") return shown.filter((t) => t.ti?.length).sort((a, b) => b.ti!.length - a.ti!.length || (sharePh(b) ?? 0) - (sharePh(a) ?? 0));
  return shown.filter((t) => t.po).sort((a, b) => b.po - a.po || (sharePh(b) ?? 0) - (sharePh(a) ?? 0));
}

export function barItem(kind: BarKind, t: AtRow, c: BarCtx): BarItem {
  const base = { key: t.f, name: t.name, abbr: t.ab, href: c.paths.team(c.lg, t.f), logo: t.logo, tl: t.tl ?? null, td: t.td ?? null, gone: !t.on };
  if (kind === "share") return { ...base, value: shareAt(t, c.phase)!, text: fmt3(shareAt(t, c.phase)!), tip: `${t.name}: ${recText(lineAt(t, c.phase))}` };
  if (kind === "titles") return { ...base, value: t.ti!.length, text: c.fmt(t.ti!.length), tip: `${t.name}: ${t.ti!.map((y) => seasonLabel(c.lg, y)).join(", ")}` };
  return { ...base, value: t.po, text: c.fmt(t.po), tip: `${t.name}: ${c.plural("count.seasons", t.po)}` };
}

/** Every franchise of one ranking as bars. */
export const barItems = (kind: BarKind, rows: readonly AtRow[], c: BarCtx): BarItem[] => barRows(kind, rows, c.phase, c.active).map((t) => barItem(kind, t, c));
