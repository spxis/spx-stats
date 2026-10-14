/**
 * The former names of a franchise for the teams list, each with the logo of its own years where we hold one. Uses the same eras as the names
 * table of a franchise page (nameEras.ts); a name whose years have no logo of their own gets none, and is shown alone (never the current logo dimmed).
 */
import type { BrandMap } from "./brand.ts";
import { dayOf, nameEras, type NameSpan } from "./nameEras.ts";

export interface FormerName { name: string; logo: string | null }

/**
 * `former` are the franchise's other names (api.team_index.former_names); `spans` its name rows (api.franchise_names) with the days each applied;
 * `first` and `last` the seasons it played, which stand for its season list (a season the league skipped changes nothing here: the logo of a name is the
 * one worn in most of its years). Oldest name first; a name with no dates last, in alphabetical order.
 */
export function formerNames(former: readonly string[], spans: readonly NameSpan[], first: number | null, last: number | null, brands: BrandMap, f: number): FormerName[] {
  const years = first != null && last != null && last >= first ? Array.from({ length: Math.min(last - first + 1, 300) }, (_, i) => first + i) : [];
  const eras = nameEras(spans, years, brands, f);
  return former
    .map((name) => {
      const mine = eras.filter((e) => e.name === name);
      const own = mine.find((e) => e.logo && !e.current);
      // Oldest first: by the day the name began; the first name of a club has no start but an end, and still goes before the rest. A name with no dates at all goes last.
      const keys = mine.filter((e) => e.from || e.to).map((e) => `${dayOf(e.from) ?? "0000-00-00"}|${dayOf(e.to) ?? "9999-99-99"}`).sort();
      return { name, logo: own?.logo ?? null, key: keys[0] ?? null };
    })
    .sort((a, b) => (a.key && b.key ? a.key.localeCompare(b.key) : a.key ? -1 : b.key ? 1 : 0) || a.name.localeCompare(b.name))
    .map(({ name, logo }) => ({ name, logo }));
}
