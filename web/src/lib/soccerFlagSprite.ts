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
