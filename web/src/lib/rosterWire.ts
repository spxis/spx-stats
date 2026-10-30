import type { StatKind } from "./playerStats";

/**
 * A club's roster table as it travels to the page: the columns (their words already in the reader's language) and one short line for each player. The table
 * draws the cells in the browser (components/RosterTable.tsx), so a page carries a few dozen bytes for a player instead of his cells drawn on the server and sent twice.
 */
export type RosterCol =
  | { key: string; label: string; title?: string; type: "nat" | "player" | "titles" | "pos" }
  /** A statistic: `v[slot]` is the value (a rate already worked out), written as `kind` says. */
  | { key: string; label: string; title?: string; type: "stat"; kind: StatKind; slot: number }
  /** A plain number (a jersey number): `v[slot]`. */
  | { key: string; label: string; title?: string; type: "num"; slot: number }
  /** The position column of a listed roster, which sorts in the league's own order: `v[slot]` is the position's place in it. */
  | { key: string; label: string; title?: string; type: "posrank"; slot: number };

/** [person id, name, country code, career titles, position codes, address when it is not the usual one (a person filed under another league), values of the stat, number and position-order columns by slot]. */
export type RosterLine = [id: number, name: string, nat: string | null, titles: number | null, positions: string[], href: string | null, v: (number | null)[]];

export interface RosterTableData {
  lg: string;
  /** The sort when the address names none: `column.dir`. */
  def: string;
  /** The query key that holds this table's sort. */
  param: string;
  cols: RosterCol[];
  lines: RosterLine[];
  /** The name of each position code in the reader's language (null: a bare code). */
  names: Record<string, string | null>;
  /** The country codes that have a flag. */
  flags: string[];
}

/** A rate written to seven decimals: shorter on the wire, and still apart for any two figures the table can hold. */
export const wire = (n: number | null): number | null => (n == null || Number.isNaN(n) ? null : Math.round(n * 1e7) / 1e7);
