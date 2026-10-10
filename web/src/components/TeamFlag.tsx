import { flag } from "@johnmorrisdotca/hata/load";
import { COUNTRY_NAME } from "@/lib/country";
import "./team.css";

/**
 * A small, quiet flag of the country a team plays in, from Hata (MIT; the drawings are from Wikimedia Commons),
 * drawn on the server as inline SVG. A code Hata has no flag for draws nothing.
 */
export async function TeamFlag({ code }: { code: string | null | undefined }) {
  if (!code) return null;
  const svg = await flag(code.toUpperCase()).catch(() => null);
  if (!svg) return null;
  const name = COUNTRY_NAME[code.toUpperCase()] ?? code;
  return <span className="tflag" role="img" aria-label={`Flag of ${name}`} title={name} dangerouslySetInnerHTML={{ __html: svg }} />;
}
