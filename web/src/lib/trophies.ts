/* Each league's championship trophy, as a one-colour line icon in the page colour (currentColor). The drawings come from
   John's package @johnmorrisdotca/dougu-sports (MIT), not from this site: its generic cups, which suggest the trophy rather
   than reproduce it. The markup is built at development time into trophies.generated.ts (scripts/trophyMarkup.ts,
   `pnpm trophies`), so the package's renderer stays out of the browser bundle. Credited on /terms. */
import { TROPHY_MARKUP } from "./trophies.generated.ts";

/** Trusted, static SVG markup for a league's trophy (generated from fixed package drawings, never user input). */
export const trophySvg = (lg: string): string => TROPHY_MARKUP[lg] || TROPHY_MARKUP.nhl;
