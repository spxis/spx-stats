/* The gold, silver and bronze medals for a first, second or third place, from @johnmorrisdotca/dougu-sports (MIT), built at
   development time into medals.generated.ts (scripts/trophyMarkup.ts, `pnpm trophies`). Credited on /terms. */
import { MEDAL_MARKUP } from "./medals.generated.ts";

/** Trusted, static SVG markup (metal style, so gold, silver and bronze keep their colour) for a first, second or third place medal, or "" for any other place. */
export const medalSvg = (place: number): string => MEDAL_MARKUP[place] ?? "";
