import "server-only";
import { manifest } from "@johnmorrisdotca/hata/manifest";

/** Whether Hata has a flag for this code (a country's alpha-2 code or a subdivision's, in any case): exactly the codes its `flag()` loads one for. */
export const hasFlag = (code: string | null | undefined): code is string => !!code && manifest(code.toUpperCase()) !== null;

/**
 * The countries, of these codes, that have a flag, as the lookup the client components take (`flags[code]`): they draw the flag from its file
 * (components/FlagIcon.tsx) and need only to know there is one. Nothing is read from the flag files here.
 */
export function flagCodes(codes: Iterable<string>): Record<string, true> {
  const out: Record<string, true> = {};
  for (const c of codes) if (hasFlag(c)) out[c] = true;
  return out;
}
