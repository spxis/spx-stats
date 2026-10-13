/**
 * Which drawing a venue gets from @johnmorrisdotca/kyogijo (0.1.0): a surface for the sport of each league that played there, and for
 * a ballpark a club plays in today, that park's own outfield fence. Kyogijo 0.1.0 knows the thirty current MLB parks by a key of its own
 * (`fenway-park`) and carries no Wikidata ids, so a park is found by name: any name the venue has had (the archive can still hold the
 * old sponsor's name). A past park, even one that shared a name with today's (the first Yankee Stadium), gets the generic field.
 *
 * Pure and import-free, so a node script can test it against kyogijo's own list of parks.
 */

/** The sports kyogijo draws, by the league whose clubs played there. A league not listed has no drawing. */
export const SURFACE_SPORT = { nhl: "nhl", nba: "nba", nfl: "nfl", cfl: "cfl", mlb: "mlb" } as const;
export type SurfaceSport = (typeof SURFACE_SPORT)[keyof typeof SURFACE_SPORT];

/** Kyogijo's key of each current MLB park, with the names the park has gone by. */
export const MLB_PARKS: Readonly<Record<string, readonly string[]>> = {
  "oriole-park-at-camden-yards": ["Oriole Park at Camden Yards", "Camden Yards"],
  "fenway-park": ["Fenway Park"],
  "yankee-stadium": ["Yankee Stadium"],
  "tropicana-field": ["Tropicana Field", "The Thunderdome", "Florida Suncoast Dome"],
  "rogers-centre": ["Rogers Centre", "SkyDome"],
  "rate-field": ["Rate Field", "Guaranteed Rate Field", "U.S. Cellular Field", "New Comiskey Park", "Comiskey Park II"],
  "progressive-field": ["Progressive Field", "Jacobs Field"],
  "comerica-park": ["Comerica Park"],
  "kauffman-stadium": ["Kauffman Stadium", "Royals Stadium"],
  "target-field": ["Target Field"],
  "daikin-park": ["Daikin Park", "Minute Maid Park", "Enron Field", "Astros Field"],
  "angel-stadium": ["Angel Stadium", "Angel Stadium of Anaheim", "Edison International Field of Anaheim", "Anaheim Stadium"],
  "sutter-health-park": ["Sutter Health Park", "Raley Field"],
  "t-mobile-park": ["T-Mobile Park", "Safeco Field"],
  "globe-life-field": ["Globe Life Field"],
  "truist-park": ["Truist Park", "SunTrust Park"],
  "loandepot-park": ["loanDepot Park", "Marlins Park"],
  "citi-field": ["Citi Field"],
  "citizens-bank-park": ["Citizens Bank Park"],
  "nationals-park": ["Nationals Park"],
  "wrigley-field": ["Wrigley Field"],
  "great-american-ball-park": ["Great American Ball Park"],
  "american-family-field": ["American Family Field", "Miller Park"],
  "pnc-park": ["PNC Park"],
  "busch-stadium": ["Busch Stadium"],
  "chase-field": ["Chase Field", "Bank One Ballpark"],
  "coors-field": ["Coors Field"],
  "dodger-stadium": ["Dodger Stadium"],
  "petco-park": ["Petco Park"],
  "oracle-park": ["Oracle Park", "AT&T Park", "SBC Park", "Pacific Bell Park"],
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const BY_NAME = new Map(Object.entries(MLB_PARKS).flatMap(([id, names]) => names.map((n) => [norm(n), id] as const)));

/**
 * The kyogijo key of the MLB park a venue is, or null (use the generic field). `names` is every name the venue has had; `current` is
 * whether an MLB club plays there now: only then is a name taken to mean today's park.
 */
export function parkIdFor(names: readonly string[], current: boolean): string | null {
  if (!current) return null;
  for (const n of names) {
    const id = BY_NAME.get(norm(n));
    if (id) return id;
  }
  return null;
}

/**
 * The file a drawing is served from (`/surface/<name>`): `nfl.en.svg` for a sport's standard surface, `mlb-fenway-park.ja.svg` for a
 * ballpark's own. The page names a drawing with an <img> instead of carrying the SVG twice (in its HTML and in its data).
 */
export function surfaceFileName(sport: SurfaceSport, park: string | null, language: "en" | "ja"): string {
  return `${park ? `${sport}-${park}` : sport}.${language}.svg`;
}

/** The sport, park and language a file name stands for, or null when it names none (the caller checks the park against kyogijo's list). */
export function parseSurfaceFile(name: string): { sport: SurfaceSport; park: string | null; language: "en" | "ja" } | null {
  const m = /^([a-z]+)(?:-([a-z0-9-]+))?\.(en|ja)\.svg$/.exec(name);
  if (!m) return null;
  const sport = Object.values(SURFACE_SPORT).find((s) => s === m[1]);
  if (!sport || (m[2] && sport !== "mlb")) return null;
  return { sport, park: m[2] ?? null, language: m[3] as "en" | "ja" };
}
