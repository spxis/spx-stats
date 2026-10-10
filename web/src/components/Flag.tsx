import { flag } from "@johnmorrisdotca/hata/load";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { countryName } from "@/lib/people-format";

/**
 * A small flag beside a country, from Hata (MIT; the drawings are from Wikimedia Commons), drawn on the server as inline SVG.
 * A code Hata has no flag for draws nothing, and the country's name is always beside it.
 */
export async function Flag({ code, size = 16 }: { code: string | null | undefined; size?: number }) {
  if (!code) return null;
  const svg = await flag(code.toUpperCase()).catch(() => null);
  if (!svg) return null;
  const { say, locale } = await currentSpeaker();
  const name = countryName(code, locale);
  return <span className="pflag" role="img" aria-label={say("flag.of", { name })} title={name} style={{ "--fh": `${size}px` } as React.CSSProperties} dangerouslySetInnerHTML={{ __html: svg }} />;
}
