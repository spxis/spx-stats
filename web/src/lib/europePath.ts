/**
 * Addresses of the European club-league pages (no server code, so a client component can use them too; docs/soccer-europe.md):
 *   /soccer/premier-league              the division: every season with its champion, clubs by titles
 *   /soccer/premier-league/2005-06      one season: table, promotion and relegation, results
 *   /soccer/club/arsenal                one club: every season across the divisions
 * A division's address is its league code with hyphens; a season is the year it starts and the last two digits of the year it ends (1999-00).
 */

/** The divisions, by country, top division first. Only the five top divisions are links of the soccer chips and the soccer page. */
export const EUROPE_SYSTEMS = [
  { key: "england", leagues: ["premier_league", "efl_championship", "efl_league_one", "efl_league_two", "national_league"] },
  { key: "spain", leagues: ["la_liga", "segunda_division"] },
  { key: "germany", leagues: ["bundesliga", "bundesliga_2", "liga_3"] },
  { key: "italy", leagues: ["serie_a", "serie_b"] },
  { key: "france", leagues: ["ligue_1", "ligue_2"] },
] as const;

export const EUROPE_TOP_LEAGUES = ["premier_league", "la_liga", "bundesliga", "serie_a", "ligue_1"] as const;

export const EUROPE_PATH = "/soccer";
export const leagueSlug = (code: string): string => code.replace(/_/g, "-");
export const leagueOfSlug = (slug: string): string | null => (/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(slug) && slug !== "club" ? slug.replace(/-/g, "_") : null);

/** 2005 -> "2005-06", 1999 -> "1999-00". */
export const seasonLabel = (year: number): string => `${year}-${String((year + 1) % 100).padStart(2, "0")}`;

/** "2005-06" -> 2005; null for anything else (the end must be the year after the start). */
export function yearOfSeasonLabel(label: string): number | null {
  const m = /^(\d{4})-(\d{2})$/.exec(label);
  if (!m) return null;
  const y = Number(m[1]);
  return (y + 1) % 100 === Number(m[2]) ? y : null;
}

export const europeLeaguePath = (code: string): string => `${EUROPE_PATH}/${leagueSlug(code)}`;
export const europeSeasonPath = (code: string, year: number): string => `${EUROPE_PATH}/${leagueSlug(code)}/${seasonLabel(year)}`;
export const europeClubPath = (slug: string): string => `${EUROPE_PATH}/club/${slug}`;
