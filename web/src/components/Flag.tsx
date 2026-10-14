import { FlagIcon } from "@/components/FlagIcon";
import type { FlagShape } from "@/lib/flagSvg";
import { hasFlag } from "@/lib/flagCodes";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { countryName } from "@/lib/people-format";

/**
 * A small flag beside a country, one fixed size per shape everywhere (see FlagIcon), an image of the flag's own file.
 * `shape` is "rect" (24×16, the default, for tables and headings), "round" (18×18) or "square" (18×18) for country
 * buttons and chips; round and square are Hata's own frames, which never stretch or misrepresent a flag.
 * A code Hata has no flag for draws nothing, and the country's name is always beside it or in the tooltip.
 */
export async function Flag({ code, shape = "rect" }: { code: string | null | undefined; shape?: FlagShape }) {
  if (!code) return null;
  if (!hasFlag(code)) return null;
  const { say, locale } = await currentSpeaker();
  const name = countryName(code, locale);
  return <FlagIcon code={code} shape={shape} name={name} label={say("flag.of", { name })} />;
}
