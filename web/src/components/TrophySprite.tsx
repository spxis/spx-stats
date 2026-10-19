import { trophySymbols, type TrophyArt } from "@/lib/cups";

/** The drawings of the trophies a page lists, once each, as symbols of a zero-size SVG at the top of the list (a card points at its own with `<use>`). */
export function TrophySprite({ arts }: { arts: readonly TrophyArt[] }) {
  return <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }} dangerouslySetInnerHTML={{ __html: `<defs>${trophySymbols(arts)}</defs>` }} />;
}
