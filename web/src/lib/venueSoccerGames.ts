/**
 * What was played at a world soccer stadium, from its matches (api.soccer_matches): the World Cup editions with their rounds and final, and the MLS clubs that
 * played at home there with their years, the MLS Cup finals and the playoff rounds. Pure and import-free of Next, so a node script can test it; the server side
 * that reads the matches is venueSoccer.ts.
 */

/** The columns of a match this page needs. */
export interface VenueMatch {
  match_id: number;
  league: string;
  year: number;
  stage_key: string;
  stage_order: number;
  group_name: string | null;
  match_date: string;
  home_team_id: string;
  home: string;
  home_slug: string;
  home_flag: string | null;
  home_goals: number;
  away: string;
  away_slug: string;
  away_flag: string | null;
  away_goals: number;
  extra_time: boolean;
  shootout: boolean;
  home_penalties: number | null;
  away_penalties: number | null;
}

/** A round of an edition and how many matches of it were played at the stadium. */
export interface Round { stage: string; order: number; matches: number }

/** One World Cup, men's or women's, as far as the stadium is concerned. `final` is the match that decided it, when it was played here. */
export interface Edition { lg: "wc" | "wwc"; year: number; matches: VenueMatch[]; rounds: Round[]; final: VenueMatch | null }

/** An MLS club that played home matches at the stadium (the MLS Cup final, played at a neutral ground, is not one of them). */
export interface MlsTenant { id: string; slug: string; name: string; from: number; to: number; matches: number }

export interface MlsSummary { matches: number; seasons: number; tenants: MlsTenant[]; finals: VenueMatch[]; playoffs: number }

export interface SoccerGames { editions: Edition[]; mls: MlsSummary | null }

const byDate = (a: VenueMatch, b: VenueMatch) => a.match_date.localeCompare(b.match_date) || a.match_id - b.match_id;

/** The rounds of an edition in the order they were played, with the number of matches of each. */
export function roundsOf(matches: readonly VenueMatch[]): Round[] {
  const by = new Map<string, Round>();
  for (const m of matches) {
    const r = by.get(m.stage_key);
    if (r) r.matches++; else by.set(m.stage_key, { stage: m.stage_key, order: m.stage_order, matches: 1 });
  }
  return [...by.values()].sort((a, b) => a.order - b.order);
}

/** The matches of a stadium as World Cup editions (oldest first) and an MLS summary (null when no MLS match was played there). */
export function summarizeGames(list: readonly VenueMatch[]): SoccerGames {
  const cups = new Map<string, VenueMatch[]>();
  const mls: VenueMatch[] = [];
  for (const m of [...list].sort(byDate)) {
    if (m.league === "mls") { mls.push(m); continue; }
    if (m.league !== "wc" && m.league !== "wwc") continue;
    const k = `${m.league}|${m.year}`;
    cups.set(k, [...(cups.get(k) ?? []), m]);
  }
  const editions: Edition[] = [...cups].map(([k, matches]) => {
    const [lg, year] = k.split("|");
    return { lg: lg as Edition["lg"], year: Number(year), matches, rounds: roundsOf(matches), final: matches.find((m) => m.stage_key === "final") ?? null };
  }).sort((a, b) => a.year - b.year || a.lg.localeCompare(b.lg));
  if (!mls.length) return { editions, mls: null };
  const tenants = new Map<string, MlsTenant>();
  for (const m of mls) {
    if (m.stage_key === "final") continue;
    const t = tenants.get(m.home_team_id);
    if (t) { t.from = Math.min(t.from, m.year); t.to = Math.max(t.to, m.year); t.matches++; t.name = m.home; } else tenants.set(m.home_team_id, { id: m.home_team_id, slug: m.home_slug, name: m.home, from: m.year, to: m.year, matches: 1 });
  }
  return {
    editions,
    mls: {
      matches: mls.length,
      seasons: new Set(mls.map((m) => m.year)).size,
      tenants: [...tenants.values()].sort((a, b) => a.from - b.from || a.name.localeCompare(b.name, "en")),
      finals: mls.filter((m) => m.stage_key === "final"),
      playoffs: mls.filter((m) => m.stage_key !== "regular").length,
    },
  };
}
