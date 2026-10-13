import "server-only";
import { describe, drawSurface, parkById } from "@johnmorrisdotca/kyogijo";
import type { VenueDetail } from "./venueDataset";
import type { VenueRow } from "./venueModel";
import { eraOf, erasOf, MLB_PARK_IDS, parkExtras, parkIdFor, parseSurfaceFile, SURFACE_SPORT, surfaceFileName, type SurfaceSport } from "./venuePark";

/**
 * One drawing of a venue: the surface of a sport, served as a file (`/surface/<file>`, see app/surface) and named by an <img> with its
 * title and description as the alternative text. `park` is the ballpark whose fence it follows, when it is one; `year` is the venue's last
 * season for that league, which the drawing is as of (null while a club still plays there: the surface is today's).
 */
export interface Surface { sport: SurfaceSport; park: string | null; parkName: string | null; year: number | null; src: string; alt: string; width: number; height: number }

type Language = "en" | "ja";
interface Drawn { svg: string; alt: string; width: number; height: number }

/**
 * The options of a drawing. A football field leaves out its small markings (hash marks), which halves its size. `era` is the season whose
 * rules and fence the drawing shows; a ballpark's walls and quirks are turned on where the park has figures for them in that season.
 */
const optionsOf = (sport: SurfaceSport, park: string | null, language: Language, era: number | null) => ({
  sport,
  language,
  ...(sport === "nfl" || sport === "cfl" ? { detail: "simple" as const } : {}),
  ...(park ? { park, ...parkExtras(park, era) } : {}),
  ...(era != null ? { year: era } : {}),
});

const drawn = new Map<string, Drawn>();

/**
 * A drawing as a file of its own: kyogijo's SVG with its stylesheet inside, since an image cannot see the page's. The stylesheet
 * looks for the page's `html` element to follow the dark setting; a file has none, so that part is cut and the dark colours follow the
 * browser's setting instead.
 */
function draw(sport: SurfaceSport, park: string | null, language: Language, era: number | null): Drawn {
  const key = surfaceFileName(sport, park, language, era);
  let d = drawn.get(key);
  if (!d) {
    const o = optionsOf(sport, park, language, era);
    const svg = drawSurface(o).replaceAll("html:not([data-theme=light]) ", "");
    const box = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(svg);
    const { title, description } = describe(o);
    d = { svg, alt: `${title}. ${description}`, width: Math.round(Number(box?.[1] ?? 400)), height: Math.round(Number(box?.[2] ?? 200)) };
    drawn.set(key, d);
  }
  return d;
}

/**
 * Every file a venue page can name: each sport's surface in each era of its rules, and each MLB ballpark's own (a past one in each era of
 * its fence), in both languages (a few hundred, drawn at build).
 */
export function surfaceFiles(): string[] {
  const names: string[] = [];
  for (const language of ["en", "ja"] as const) {
    for (const sport of Object.values(SURFACE_SPORT)) for (const era of erasOf(sport, null)) names.push(surfaceFileName(sport, null, language, era));
    for (const park of MLB_PARK_IDS) for (const era of erasOf("mlb", park)) names.push(surfaceFileName("mlb", park, language, era));
  }
  return names;
}

/** The SVG text of a file name, or null when it names no drawing. */
export function surfaceFile(name: string): string | null {
  const f = parseSurfaceFile(name);
  if (!f || (f.park && !MLB_PARK_IDS.includes(f.park)) || !erasOf(f.sport, f.park).includes(f.era)) return null;
  return draw(f.sport, f.park, f.language, f.era).svg;
}

/** The last season a club of the league played at the venue, or null while one still does (or none is known to have left). */
function lastSeason(row: VenueRow, league: string): number | null {
  const clubs = row.clubs.filter((c) => c.lg === league);
  if (!clubs.length || clubs.some((c) => c.to == null)) return null;
  return Math.max(...clubs.map((c) => c.to as number));
}

/**
 * The drawings of a venue, one for each sport of the leagues that played there, each as of the venue's last season for that league (the
 * markings of the era, and for a ballpark the fence, walls and quirks it had then). The page names each file with an <img>, so the SVG is
 * in neither the page's HTML nor its data (it was in both, which made a venue with three drawings 100 KB); the files are made once at
 * build and kept. A ballpark an MLB club played in is drawn with its own fence, found by its Wikidata id; every other venue gets the
 * sport's standard surface.
 */
export function surfacesFor(row: VenueRow, detail: VenueDetail, language: Language): Surface[] {
  const sports = [...new Set(row.leagues.map((l) => (SURFACE_SPORT as Record<string, SurfaceSport | undefined>)[l]).filter((s): s is SurfaceSport => !!s))];
  return sports.map((sport) => {
    const year = lastSeason(row, sport);
    const park = sport === "mlb" ? parkIdFor([row.name, ...detail.names.map((n) => n.name)], year == null, detail.wid) : null;
    const era = eraOf(sport, park, year);
    const d = draw(sport, park, language, era);
    return {
      sport, park, parkName: park ? parkById(park)?.name ?? null : null, year,
      src: `/surface/${surfaceFileName(sport, park, language, era)}`, alt: d.alt, width: d.width, height: d.height,
    };
  });
}
