import { cupSymbols } from "@/lib/cups";

/** The line cups of the leagues a table names, once, as symbols of a zero-size SVG at the top of the table (AwardCup points at them with `<use>`). */
export function CupSprite({ leagues }: { leagues: readonly string[] }) {
  return <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }} dangerouslySetInnerHTML={{ __html: `<defs>${cupSymbols(leagues)}</defs>` }} />;
}
