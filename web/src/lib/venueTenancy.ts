/**
 * Which clubs played at a venue, and in which years, from the home-venue periods (api.venue_home_period, over core.franchise_home_venue): one period per
 * club, venue and stretch of days. Pure and import-free of Next, so a node script can test it. The brand layer the /venues list is built from names only
 * the venue each logo era lists, so it misses tenants such as the Blue Jays at Exhibition Stadium 1977-89; the periods hold them.
 */

/** A row of api.venue_home_period. `valid_to` is null while the period is open; `last_season` is the franchise's last season, `league_last` its league's latest. */
export interface PeriodRow {
  wikidata_id: string;
  franchise_id: number;
  league: string;
  valid_from: string | null;
  valid_to: string | null;
  last_season: number;
  league_last: number;
}

/** A club's use of a venue, in whole years: `from` and `to` are the first and last season, `to` null while the club still plays there. */
export interface Tenancy { lg: string; f: number; from: number | null; to: number | null }

const yearOf = (d: string | null): number | null => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);

/** The last year of a period that ends on `d` (exclusive): a period that ends on 1 January ended the year before. */
const lastYear = (d: string): number | null => {
  const y = yearOf(d);
  return y != null && /^\d{4}-01-01/.test(d) ? y - 1 : y;
};

/**
 * Every club's tenancy of every venue, by the venue's Wikidata id (upper case), the clubs in the order they first used it. A club that left and came back
 * is one tenancy from its first year to its last. An open period of a franchise that stopped playing ended in the franchise's last season, not today.
 */
export function tenanciesOf(rows: readonly PeriodRow[]): Map<string, Tenancy[]> {
  const out = new Map<string, Tenancy[]>();
  const sorted = [...rows].sort((a, b) => (a.valid_from ?? "").localeCompare(b.valid_from ?? "") || a.franchise_id - b.franchise_id);
  for (const r of sorted) {
    const gone = r.valid_to == null && r.last_season < r.league_last - 1;
    const to = r.valid_to != null ? lastYear(r.valid_to) : gone ? r.last_season : null;
    const from = yearOf(r.valid_from);
    const key = r.wikidata_id.toUpperCase();
    const list = out.get(key) ?? [];
    const had = list.find((t) => t.lg === r.league && t.f === r.franchise_id);
    if (had) {
      had.from = had.from == null || from == null ? null : Math.min(had.from, from);
      had.to = had.to == null || to == null ? null : Math.max(had.to, to);
    } else {
      list.push({ lg: r.league, f: r.franchise_id, from, to: to != null && from != null && to < from ? from : to });
    }
    out.set(key, list);
  }
  return out;
}
