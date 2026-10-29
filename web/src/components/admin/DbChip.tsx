import { PHRASES, type PhraseKey } from "@/lib/i18n/phrases.constants";

/** The databases and sources an admin chip can name. `ds1-snapshot`: numbers DS1 pushed, read through production. */
export type DbKey = "production" | "turso" | "ds1" | "ds1-snapshot" | "snapshot" | "board";

const KEY: Record<DbKey, PhraseKey> = {
  production: "db.chip.production",
  turso: "db.chip.turso",
  ds1: "db.chip.ds1",
  "ds1-snapshot": "db.chip.ds1Snapshot",
  snapshot: "db.chip.snapshot",
  board: "db.chip.board",
};

/**
 * A chip beside an admin heading or a release row, naming the database its numbers come from or the one a release writes to.
 * Same shape as the status chip (`tk-badge`); the colour is one token per database (globals.css, `--db-*`, both themes).
 * Sync on purpose, so it can sit inside table cells the page passes to SortTable. English only.
 */
export function DbChip({ db }: { db: DbKey }) {
  return <span className={`tk-badge db-chip db-${db}`}>{PHRASES[KEY[db]]}</span>;
}
