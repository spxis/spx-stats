/** Where the World Cup pages' flags live (see components/SoccerFlag.tsx) and how a flag is named inside the file. No server code, so a client component can use it. */
export const SOCCER_FLAGS_PATH = "/soccer-flags.svg";
export const flagSymbolId = (code: string): string => `sf-${code.toLowerCase()}`;
