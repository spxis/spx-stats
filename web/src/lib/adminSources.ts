import { z } from "zod";
import { SOURCE_REGISTRY, type SourceEntry, type SourceTier } from "../data/sourceRegistry.ts";

/**
 * The admin side of the source tiers (scripts/daily/sources.py, snapshot in data/sourceRegistry.ts): which entries are grey, which text
 * names a grey source (so the run log can show the "grey area" marker beside it), and the shape of api.grey_only_rows (migration 153).
 * Pure, so the page, the run log and the test read the same rules.
 */
export const TIER_ORDER: SourceTier[] = ["green", "grey", "red-confirm", "red"];

export const isGrey = (s: SourceEntry): boolean => s.tier === "grey";

export const byTier = (registry: SourceEntry[] = SOURCE_REGISTRY): SourceEntry[] =>
  [...registry].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));

const TOKEN = /[a-z0-9][a-z0-9._-]*/gi;

/** The grey sources a run names: its job, scope or item names equal a registry id, or a text holds a registry host. */
export function greySourcesIn(texts: Array<string | null | undefined>, registry: SourceEntry[] = SOURCE_REGISTRY): SourceEntry[] {
  const greys = registry.filter(isGrey);
  const found = new Set<SourceEntry>();
  for (const raw of texts) {
    if (!raw) continue;
    const text = raw.toLowerCase();
    const tokens = new Set(text.match(TOKEN) ?? []);
    for (const s of greys) {
      const id = s.id.toLowerCase();
      if (tokens.has(id) || tokens.has(id.replace(/_/g, "-")) || [...tokens].some((t) => t.startsWith(`${id}:`) || t.startsWith(`${id}-`))) found.add(s);
      else if (s.hosts.some((h) => text.includes(h.toLowerCase()))) found.add(s);
    }
  }
  return [...found];
}

/** One line of api.grey_only_rows: how many rows of one kind only a grey source holds. */
export const greyOnlyRow = z.object({ source: z.string(), entity_kind: z.string(), n_rows: z.number() });
export type GreyOnlyRow = z.infer<typeof greyOnlyRow>;

/** The report grouped by source, biggest first. */
export function greyOnlyBySource(rows: GreyOnlyRow[]): Array<{ source: string; total: number; kinds: Array<{ kind: string; n: number }> }> {
  const map = new Map<string, { source: string; total: number; kinds: Array<{ kind: string; n: number }> }>();
  for (const r of rows) {
    const e = map.get(r.source) ?? { source: r.source, total: 0, kinds: [] };
    e.total += r.n_rows;
    e.kinds.push({ kind: r.entity_kind, n: r.n_rows });
    map.set(r.source, e);
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.source.localeCompare(b.source));
}
