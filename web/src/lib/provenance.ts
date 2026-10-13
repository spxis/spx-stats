/**
 * Where the published records came from, and whether a second source agrees: the pure part (no Next imports, so a node script can test it).
 * The rows are api.provenance (db/migrations/056_api_provenance.sql): records counted by kind, league, the source they were loaded from,
 * the source that checked them and the outcome.
 */
import { isSpx } from "./leagues.ts";

export const KINDS = ["game", "team_season", "season", "person"] as const;
export type Kind = (typeof KINDS)[number];
export const OUTCOMES = ["confirmed", "disputed", "not_found", "single"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export interface ProvRow {
  kind: string;
  league: string | null;
  source: string | null;
  checked_by: string | null;
  outcome: string;
  n: number;
}

/** SPX's databases, scraper store and published files are one source, like everywhere else on the site; a record with no source is its own group. */
export const sourceGroup = (code: string | null): string => (code == null ? "unknown" : isSpx(code) ? "spx" : code);

const isKind = (k: string): k is Kind => (KINDS as readonly string[]).includes(k);
const isOutcome = (o: string): o is Outcome => (OUTCOMES as readonly string[]).includes(o);

/** The records of one source, outcome and kind, with how many each second source checked. */
export interface Triple {
  source: string;
  outcome: Outcome;
  kind: Kind;
  n: number;
  checkers: Map<string, number>;
}

/**
 * The rows added up by (source, outcome, kind). `league` null keeps everything, including the people (who belong to no one league);
 * a league keeps only that league's records. Rows the diagram does not know (a new kind or outcome) are left out rather than guessed at.
 */
export function provenanceTriples(rows: ProvRow[], league: string | null): Triple[] {
  const by = new Map<string, Triple>();
  for (const r of rows) {
    if (!isKind(r.kind) || !isOutcome(r.outcome) || r.n <= 0) continue;
    if (league != null && r.league !== league) continue;
    const source = sourceGroup(r.source);
    const key = `${source}|${r.outcome}|${r.kind}`;
    let t = by.get(key);
    if (!t) { t = { source, outcome: r.outcome, kind: r.kind, n: 0, checkers: new Map() }; by.set(key, t); }
    t.n += r.n;
    if (r.checked_by) { const c = sourceGroup(r.checked_by); t.checkers.set(c, (t.checkers.get(c) ?? 0) + r.n); }
  }
  return [...by.values()];
}

/** The weight a count is drawn at: its cube root, so a few hundred seasons stay visible beside two hundred thousand games. */
export const weight = (n: number): number => Math.cbrt(n);

export const sum = (list: Iterable<{ n: number }>): number => { let s = 0; for (const x of list) s += x.n; return s; };

/** The sources of the triples, the most records first. */
export function sourcesByCount(triples: Triple[]): string[] {
  const total = new Map<string, number>();
  for (const t of triples) total.set(t.source, (total.get(t.source) ?? 0) + t.n);
  return [...total.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([s]) => s);
}
