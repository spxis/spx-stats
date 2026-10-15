/**
 * Where the World Cup pages' flags live (see components/SoccerFlag.tsx) and how a flag is named inside each file. No server code, so a client
 * component can use it. There are two files, one per shape, so a page downloads only the shape it draws (the pages draw round flags; the
 * rectangle file is kept for a page that wants the flag as a flag).
 */
export type SoccerFlagShape = "rect" | "round";
export const SOCCER_FLAGS_PATH = "/soccer-flags.svg";
export const SOCCER_FLAGS_ROUND_PATH = "/soccer-flags-round.svg";
export const soccerFlagsPath = (shape: SoccerFlagShape): string => (shape === "round" ? SOCCER_FLAGS_ROUND_PATH : SOCCER_FLAGS_PATH);
export const flagSymbolId = (code: string, shape: SoccerFlagShape = "rect"): string => `${shape === "round" ? "sfr" : "sf"}-${code.toLowerCase()}`;

/**
 * One national team's flag as a file of its own (app/soccer-flag/[file]), for kyogijo, which names a logo by address: `ES.svg` is Hata's round frame (a round mark's flag),
 * `ES.rect.svg` the flag in its own proportions (a pageant's carpet). Null for a team with no flag.
 */
export const soccerFlagAddress = (code: string | null | undefined, shape: "round" | "rect" = "round"): string | null =>
  code && /^[A-Za-z]{2}(?:-[A-Za-z]{3})?$/.test(code) ? `/soccer-flag/${code.toUpperCase()}${shape === "rect" ? ".rect" : ""}.svg` : null;
