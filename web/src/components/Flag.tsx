import { flag } from "@johnmorrisdotca/hata/load";
import { FlagIcon } from "@/components/FlagIcon";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { countryName } from "@/lib/people-format";

/**
 * A small flag beside a country, one fixed size everywhere (see FlagIcon), drawn on the server.
 * A code Hata has no flag for draws nothing, and the country's name is always beside it or in the tooltip.
 */
export async function Flag({ code }: { code: string | null | undefined }) {
  if (!code) return null;
  const svg = await flag(code.toUpperCase()).catch(() => null);
  if (!svg) return null;
  const { say, locale } = await currentSpeaker();
  const name = countryName(code, locale);
  return <FlagIcon svg={svg} name={name} label={say("flag.of", { name })} />;
}
