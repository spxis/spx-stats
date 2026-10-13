import "server-only";
import { describe, drawSurface, parkById, PARK_IDS } from "@johnmorrisdotca/kyogijo";
import type { VenueDetail } from "./venueDataset";
import type { VenueRow } from "./venueModel";
import { parkIdFor, parseSurfaceFile, SURFACE_SPORT, surfaceFileName, type SurfaceSport } from "./venuePark";

/**
 * One drawing of a venue: the surface of a sport, served as a file (`/surface/<file>`, see app/surface) and named by an <img> with its
 * title and description as the alternative text. `park` is the ballpark whose fence it follows, when it is one.
 */
export interface Surface { sport: SurfaceSport; park: string | null; parkName: string | null; src: string; alt: string; width: number; height: number }

type Language = "en" | "ja";
interface Drawn { svg: string; alt: string; width: number; height: number }

/** The options of a drawing. A football field leaves out its small markings (hash marks), which halves its size. */
const optionsOf = (sport: SurfaceSport, park: string | null, language: Language) =>
  ({ sport, language, ...(sport === "nfl" || sport === "cfl" ? { detail: "simple" as const } : {}), ...(park ? { park } : {}) });

const drawn = new Map<string, Drawn>();

/**
 * A drawing as a file of its own: kyogijo's SVG with its stylesheet inside, since an image cannot see the page's. The stylesheet
 * looks for the page's `html` element to follow the dark setting; a file has none, so that part is cut and the dark colours follow the
 * browser's setting instead.
 */
function draw(sport: SurfaceSport, park: string | null, language: Language): Drawn {
  const key = surfaceFileName(sport, park, language);
  let d = drawn.get(key);
  if (!d) {
    const o = optionsOf(sport, park, language);
    const svg = drawSurface(o).replaceAll("html:not([data-theme=light]) ", "");
    const box = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(svg);
    const { title, description } = describe(o);
    d = { svg, alt: `${title}. ${description}`, width: Math.round(Number(box?.[1] ?? 400)), height: Math.round(Number(box?.[2] ?? 200)) };
    drawn.set(key, d);
  }
  return d;
}

/** Every file a venue page can name: each sport's standard surface and each ballpark's own, in both languages (a few dozen, drawn at build). */
export function surfaceFiles(): string[] {
  const sports = Object.values(SURFACE_SPORT);
  const parks = (PARK_IDS as readonly string[]);
  return (["en", "ja"] as const).flatMap((l) => [...sports.map((s) => surfaceFileName(s, null, l)), ...parks.map((p) => surfaceFileName("mlb", p, l))]);
}

/** The SVG text of a file name, or null when it names no drawing. */
export function surfaceFile(name: string): string | null {
  const f = parseSurfaceFile(name);
  if (!f || (f.park && !(PARK_IDS as readonly string[]).includes(f.park))) return null;
  return draw(f.sport, f.park, f.language).svg;
}

/**
 * The drawings of a venue, one for each sport of the leagues that played there. The page names each file with an <img>, so the SVG is
 * in neither the page's HTML nor its data (it was in both, which made a venue with three drawings 100 KB); the files are made once at
 * build and kept. A ballpark a club plays in today is drawn with its own fence; every other venue gets the sport's standard surface.
 */
export function surfacesFor(row: VenueRow, detail: VenueDetail, language: Language): Surface[] {
  const sports = [...new Set(row.leagues.map((l) => (SURFACE_SPORT as Record<string, SurfaceSport | undefined>)[l]).filter((s): s is SurfaceSport => !!s))];
  return sports.map((sport) => {
    const park = sport === "mlb" ? parkIdFor([row.name, ...detail.names.map((n) => n.name)], row.clubs.some((c) => c.lg === "mlb" && c.to == null)) : null;
    const d = draw(sport, park, language);
    return { sport, park, parkName: park ? parkById(park)?.name ?? null : null, src: `/surface/${surfaceFileName(sport, park, language)}`, alt: d.alt, width: d.width, height: d.height };
  });
}
