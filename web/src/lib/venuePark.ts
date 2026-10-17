import { eraChanges, ERA_CURRENT, PARKS, PARK_IDS, parkByWikidata, parkQuirksIn, parkWallsIn, type Park } from "@johnmorrisdotca/kyogijo-stadiums";

/**
 * Which drawing a venue gets from @johnmorrisdotca/kyogijo-stadiums (0.4.0): a surface for the sport of each league that played there, as it was
 * in the venue's last season for that league, and for a ballpark an MLB club played in, that park's own outfield fence. Kyogijo Stadiums 0.4.0 has
 * ninety-four parks, each with its Wikidata item, so a park is found by the venue's Wikidata id (Olympic Stadium, Jarry Park and the Polo
 * Grounds get their own fences). A venue with no match, or no id, falls back to the names the park has gone by, and only while an MLB club
 * plays there: a past park that shares a name with today's (the first Yankee Stadium) must not take its fence.
 *
 * A drawing is a file, and its name carries the first season of the era it shows (`nhl_1997.en.svg`), not the season asked for, so that
 * two venues in the same era share a file. The eras are the seasons the rules changed (kyogijo's `eraChanges`) and, for a past ballpark,
 * the seasons its fence, walls or quirks changed.
 */

/** The sports kyogijo draws, by the league whose clubs played there. A league not listed has no drawing. */
export const SURFACE_SPORT = { nhl: "nhl", pwhl: "nhl", nba: "nba", wnba: "nba", nfl: "nfl", cfl: "cfl", mlb: "mlb" } as const;
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
 * The kyogijo key of the MLB park a venue is, or null (use the generic field). `wikidata` is the venue's Wikidata item, the sure way: any MLB
 * park of kyogijo's, past or present. Without a match, `names` is every name the venue has had and `current` whether an MLB club plays there
 * now: only then is a name taken to mean today's park.
 */
export function parkIdFor(names: readonly string[], current: boolean, wikidata?: string | null): string | null {
  const byId = parkByWikidata(wikidata ?? undefined);
  if (byId && byId.league === "MLB") return byId.id;
  if (!current) return null;
  for (const n of names) {
    const id = BY_NAME.get(norm(n));
    if (id) return id;
  }
  return null;
}

/** The ballparks of the MLB that kyogijo draws (its NPB parks are not on a venue page). */
export const MLB_PARK_IDS: readonly string[] = PARK_IDS.filter((id) => PARKS[id].league === "MLB");

/** The park, when it is one a club has left: only these are drawn as of a season (a park that still stands is drawn as it is). */
const pastPark = (park: string | null): Park | null => (park && PARKS[park]?.status === "past" ? PARKS[park] : null);

/** The seasons the drawing of a sport (and of a past park) changes in, oldest first: the rules' changes up to today's, then the park's own. */
function changeYears(sport: SurfaceSport, park: string | null): number[] {
  const p = pastPark(park);
  const rules = eraChanges(sport).filter((c) => !c.planned && c.from != null && c.from <= ERA_CURRENT).map((c) => c.from as number);
  if (!p) return [...new Set(rules)].sort((a, b) => a - b);
  const [lo, hi] = [p.from ?? 0, p.to ?? ERA_CURRENT];
  const own = new Set<number>([lo]);
  for (const y of rules) own.add(y);
  for (const x of p.periods ?? []) { own.add(x.from); own.add(x.to + 1); }
  for (const x of [...(p.walls ?? []), ...(p.quirks ?? [])]) { if (x.first != null) own.add(x.first); if (x.last != null) own.add(x.last + 1); }
  return [...own].filter((y) => y >= lo && y <= hi).sort((a, b) => a - b);
}

/**
 * The first season of the era a season belongs to, which is what a file is named by; null for today's drawing. A season before the first
 * change gets the season before it (the sport's first state). A past ballpark has no today: it is held to the seasons it was used.
 */
export function eraOf(sport: SurfaceSport, park: string | null, year: number | null | undefined): number | null {
  const p = pastPark(park);
  if (park && !p) return null;
  const changes = changeYears(sport, park);
  if (year == null) return p ? changes[0] : null;
  const y = p ? Math.min(Math.max(year, changes[0]), p.to ?? ERA_CURRENT) : year;
  const era = changes.filter((c) => c <= y).at(-1) ?? changes[0] - 1;
  return !p && era === changes.at(-1) ? null : era;
}

/** The eras a sport (and ballpark) has a file for: null for today's, then each season an era begins. */
export function erasOf(sport: SurfaceSport, park: string | null): (number | null)[] {
  if (park && !pastPark(park)) return [null];
  const changes = changeYears(sport, park);
  return [...new Set((pastPark(park) ? changes : [changes[0] - 1, ...changes]).map((y) => eraOf(sport, park, y)))];
}

/** Whether a ballpark has walls or quirks to draw in a season (turned on only then: the options add a stylesheet to a drawing that has none). */
export function parkExtras(park: string | null, year: number | null): { walls: boolean; quirks: boolean } {
  const p = park ? PARKS[park] : undefined;
  if (!p) return { walls: false, quirks: false };
  return {
    walls: parkWallsIn(p, year ?? undefined).some((w) => w.height_ft > 0),
    quirks: parkQuirksIn(p, year ?? undefined).length > 0 || p.backstop_ft != null || p.dugouts != null,
  };
}

/**
 * The file a drawing is served from (`/surface/<name>`): `nfl.en.svg` for a sport's standard surface, `nhl_1997.en.svg` for an era's,
 * `mlb-fenway-park.ja.svg` for a ballpark's own, `mlb-polo-grounds_1911.en.svg` for a past one's. The page names a drawing with an <img>
 * instead of carrying the SVG twice (in its HTML and in its data).
 */
export function surfaceFileName(sport: SurfaceSport, park: string | null, language: "en" | "ja", era: number | null = null): string {
  return `${park ? `${sport}-${park}` : sport}${era != null ? `_${era}` : ""}.${language}.svg`;
}

/** The sport, park, era and language a file name stands for, or null when it names none (the caller checks them against `erasOf`). */
export function parseSurfaceFile(name: string): { sport: SurfaceSport; park: string | null; era: number | null; language: "en" | "ja" } | null {
  const m = /^([a-z]+)(?:-([a-z0-9-]+))?(?:_(\d{4}))?\.(en|ja)\.svg$/.exec(name);
  if (!m) return null;
  const sport = Object.values(SURFACE_SPORT).find((s) => s === m[1]);
  if (!sport || (m[2] && sport !== "mlb")) return null;
  return { sport, park: m[2] ?? null, era: m[3] ? Number(m[3]) : null, language: m[4] as "en" | "ja" };
}

/** A pitch's side as its file name writes it: metres to the half metre, a whole number or ".5". */
const pitchSide = (m: number) => String(Math.round(m * 2) / 2);

/** The file a soccer pitch is served from (`/surface/pitch-105x68.en.svg`): its length by its width in metres, to the half metre, so stadiums of one size share one file. */
export const pitchFileName = (length: number, width: number, language: "en" | "ja"): string => `pitch-${pitchSide(length)}x${pitchSide(width)}.${language}.svg`;

/** The pitch, in metres, and language a file name stands for, or null when it names none: a size a football pitch can have (90 to 120 m long, 45 to 90 m wide, in half metres). */
export function parsePitchFile(name: string): { length: number; width: number; language: "en" | "ja" } | null {
  const m = /^pitch-(\d{2,3}(?:\.5)?)x(\d{2}(?:\.5)?)\.(en|ja)\.svg$/.exec(name);
  if (!m) return null;
  const length = Number(m[1]), width = Number(m[2]);
  if (length < 90 || length > 120 || width < 45 || width > 90 || length < width) return null;
  return { length, width, language: m[3] as "en" | "ja" };
}
