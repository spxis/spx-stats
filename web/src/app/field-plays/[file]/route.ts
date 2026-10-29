import { getBrands } from "@/lib/data";
import { placeOf } from "@/lib/gamePlace";
import { getGame } from "@/lib/gameData";
import { getGameField } from "@/lib/gameField";
import { drawMlbBalls, drawNflDrives, drawStdField } from "@/lib/fieldPlaysFile";
import { speaker } from "@/lib/i18n/i18n";
import { isLocale } from "@/lib/locale";

// What a game's page draws on its field, as a file the page loads when the drawing comes into view (components/FieldPlays.tsx), so the page's HTML does not hold it:
//   /field-plays/mlb-<game id>.<kyogijo park key, or std>.<language>.svg   an MLB game's batted balls on its park
//   /field-plays/nfl-<game id>.<wide|phone>.<language>.svg                 an NFL game's drives on the field
//   /field-plays/std.<language>.svg                                         the standard baseball field with nothing on it, under a player's spray charts
// Written in the reader's language with kyogijo's own stylesheet (it follows the page's light and dark), complete by itself. Drawn on its first request, then
// kept like the page is (a day); the reads are the page's own, which the data cache holds. The park must be the one the game's page names, so
// the names a request can use are the ones a page writes; a game with no row of plays, or any other name, is a 404.
export const revalidate = 86400;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const FILE = /^(mlb|nfl)-(\d{1,9})\.([a-z0-9-]{1,60})\.(en|fr|ja)\.svg$/;
const STD = /^std\.(en|fr|ja)\.svg$/;
const SVG_HEADERS = { "Content-Type": "image/svg+xml; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=3600, s-maxage=3600" };
const missing = () => new Response("Not found\n", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const std = STD.exec(file);
  if (std && isLocale(std[1])) return new Response(drawStdField(speaker(std[1])).svg, { headers: SVG_HEADERS });
  const m = FILE.exec(file);
  if (!m || !isLocale(m[4])) return missing();
  const [, kind, id, part, locale] = m;
  const lg = kind;
  const game = await getGame(lg, Number(id));
  const row = game ? await getGameField(game.game_id, kind === "mlb" ? "mlb_balls" : "nfl_drives") : null;
  if (!game || !row) return missing();
  const brands = await getBrands();
  const sp = speaker(locale);
  let svg: string;
  if (kind === "mlb") {
    // The park is the one the page names for this game (its venue and the season), so a request cannot ask for another park's drawing of a game.
    const there = await placeOf(lg, game.year, {
      id: game.game_id, date: game.game_date, phase: game.phase, overtime: !!game.overtime,
      home: { f: game.home_f, name: game.home ?? "", score: game.home_score }, away: { f: game.away_f, name: game.away ?? "", score: game.away_score },
    }, brands);
    const park = there.park;
    if ((park ?? "std") !== part) return missing();
    svg = (await drawMlbBalls(row, game, brands, sp, park, true)).svg;
  } else {
    if (part !== "wide" && part !== "phone") return missing();
    svg = (await drawNflDrives(row, game, brands, sp, part)).svg;
  }
  return new Response(svg, { headers: SVG_HEADERS });
}
