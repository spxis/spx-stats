import { flag } from "@johnmorrisdotca/hata/load";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import "./team.css";

export const COUNTRY_KEY: Record<string, "country.ca" | "country.us" | "country.mx"> = { CA: "country.ca", US: "country.us", MX: "country.mx" };

/**
 * A small, quiet flag of the country a team plays in, from Hata (MIT; the drawings are from Wikimedia Commons),
 * drawn on the server as inline SVG. A code Hata has no flag for draws nothing.
 */
export async function TeamFlag({ code }: { code: string | null | undefined }) {
  if (!code) return null;
  const svg = await flag(code.toUpperCase()).catch(() => null);
  if (!svg) return null;
  const { say } = await currentSpeaker();
  const key = COUNTRY_KEY[code.toUpperCase()];
  const name = key ? say(key) : code;
  return <span className="tflag" role="img" aria-label={say("flag.of", { name })} title={name} dangerouslySetInnerHTML={{ __html: svg }} />;
}
