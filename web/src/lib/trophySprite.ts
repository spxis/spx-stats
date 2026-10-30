import "server-only";
import { trophyArt, trophySymbols } from "./cups";
import { getTrophyList } from "./trophyData";

/** The address of the all-trophies sprite and of one drawing in it (a card points at it with `<use href>`). */
export const TROPHY_SPRITE = "/trophy-sprite.svg";

/**
 * One SVG with a <symbol> for the drawing of every trophy in the archive (the same symbols the pages carry inline, lib/cups.ts trophySymbols), so the
 * all-leagues trophies page names its cards' drawings by address instead of holding them: as inline markup the sprite was in the page twice (25 KB each).
 * A file the browser keeps once for every page that uses it.
 */
export async function trophySpriteFile(): Promise<Response> {
  try {
    const arts = (await getTrophyList()).map((t) => trophyArt(t.code, t.kind));
    return new Response(`<svg xmlns="http://www.w3.org/2000/svg"><defs>${trophySymbols(arts)}</defs></svg>`, {
      headers: { "Content-Type": "image/svg+xml; charset=utf-8", "X-Content-Type-Options": "nosniff" },
    });
  } catch (e) {
    console.error(e);
    return new Response("The archive could not be read. Try again shortly.\n", { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}
