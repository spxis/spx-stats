/**
 * The groups of a standings table: the Conference / Division column, and the buttons that narrow the table to one conference or division (?group=). Pure and shared
 * by the page and its client component (components/StandingsFocus.tsx); tested by scripts/standingsGroups.test.ts.
 */
import type { Placed, ViewId } from "./alignment.ts";

/** A key for an address and a CSS class: lower case, runs of other characters made one dash. */
export const slug = (s: string | null | undefined): string => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** What a conference is called on a button and in the column: its short name (AL, East), else its name. */
export const confLabel = (r: Placed): string => r.conference_short ?? r.conference ?? "";

/** A division as the column shows it: "AL East" when its short name already says the league, else "East / Atlantic"; a club with no division shows its conference alone. */
export function placeLabel(r: Placed): string {
  const conf = confLabel(r), div = r.division_short ?? r.division ?? "";
  if (!div) return conf;
  if (!conf || div.toLowerCase().startsWith(conf.toLowerCase())) return div;
  return `${conf} / ${div}`;
}

/** The phrase key of the column's heading: MLB's conferences are its leagues (lib/alignment.ts viewLabel says the same). Null when no club has a place. */
export function placeHeading(lg: string, rows: readonly Placed[]): "col.leagueDiv" | "col.confDiv" | "view.league" | "view.conference" | "view.division" | null {
  const hasConf = rows.some((r) => r.conference), hasDiv = rows.some((r) => r.division);
  if (hasConf && hasDiv) return lg === "mlb" ? "col.leagueDiv" : "col.confDiv";
  if (hasConf) return lg === "mlb" ? "view.league" : "view.conference";
  return hasDiv ? "view.division" : null;
}

/** The classes a row carries so a button can find it: one for its conference and one for its division. */
export const rowClasses = (r: Placed): string => [r.conference ? `gc-${slug(confLabel(r))}` : "", r.division ? `gd-${slug(placeLabel(r))}` : ""].filter(Boolean).join(" ");

export interface GroupChoice {
  /** The value of ?group=. */
  key: string;
  label: string;
  /** The class the rows of the group carry (rowClasses), which the button's hover looks for. */
  cls: string;
  /** Whether a row is in the group. */
  has: (r: Placed) => boolean;
}

/**
 * The sub-filter buttons of a view: the conferences for the conference and wild-card views, the divisions for the division view, none for the whole league.
 * Fewer than two groups is no choice. Ordered by name. A division button carries its short name ("Atlantic"), with its conference in front only where two
 * conferences have a division of that name.
 */
export function groupChoices(view: ViewId, rows: readonly Placed[]): GroupChoice[] {
  if (view === "league") return [];
  const out = new Map<string, GroupChoice>();
  const shortCount = new Map<string, number>();
  if (view === "division") {
    for (const key of new Set(rows.filter((r) => r.division).map((r) => `${r.conference ?? ""}|${r.division_short ?? r.division}`))) {
      const short = key.slice(key.indexOf("|") + 1);
      shortCount.set(short, (shortCount.get(short) ?? 0) + 1);
    }
  }
  for (const r of rows) {
    if (view === "division") {
      if (!r.division) continue;
      const key = slug(placeLabel(r));
      const short = r.division_short ?? r.division;
      if (!out.has(key)) out.set(key, { key, label: (shortCount.get(short) ?? 0) > 1 ? placeLabel(r) : short, cls: `gd-${key}`, has: (x) => !!x.division && slug(placeLabel(x)) === key });
    } else {
      if (!r.conference) continue;
      const key = slug(confLabel(r));
      if (!out.has(key)) out.set(key, { key, label: confLabel(r), cls: `gc-${key}`, has: (x) => !!x.conference && slug(confLabel(x)) === key });
    }
  }
  const list = [...out.values()].sort((a, b) => a.label.localeCompare(b.label, "en"));
  return list.length >= 2 ? list : [];
}

/** The choice `?group=` names, or null for none (an unknown or absent value shows the whole table). */
export function chosenGroup(choices: readonly GroupChoice[], wanted: unknown): GroupChoice | null {
  const v = Array.isArray(wanted) ? wanted[0] : wanted;
  return typeof v === "string" ? choices.find((c) => c.key === v) ?? null : null;
}
