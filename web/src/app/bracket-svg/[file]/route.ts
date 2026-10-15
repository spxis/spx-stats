import { speaker } from "@/lib/i18n/i18n";
import { isLocale } from "@/lib/locale";
import { type BracketPart, seasonBracketFile } from "@/lib/seasonBracket";
import { getTournamentMatches, tournamentOfYear } from "@/lib/soccer";
import { soccerBracketFile } from "@/lib/soccerKnockoutDraw";

// A playoff or knockout bracket as a file, which the page loads when the drawing comes into view instead of carrying it in its HTML (components/KnockoutFile.tsx):
//   /bracket-svg/nba-2023.wide.en.svg   a season's whole bracket (leagues nhl, nba, mlb, nfl, cfl; parts wide and phone; lib/seasonBracket.ts draws it)
//   /bracket-svg/nba-2023.inwide.en.svg its play-in (parts inwide and inphone)
//   /bracket-svg/soccer-2022.wide.en.svg  a World Cup's knockout (parts wide and phone; lib/soccerKnockoutDraw.ts)
// Written in the reader's language with Taisen's own stylesheet (theme auto), complete by itself. Drawn on its first request, then kept like the page is (a day); the reads
// are the page's own, which the data cache holds. No query is read; a name that is no bracket is a 404.
export const revalidate = 86400;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const FILE = /^(nhl|nba|mlb|nfl|cfl|soccer)-(\d{4})\.(wide|phone|inwide|inphone)\.(en|fr|ja)\.svg$/;
const missing = () => new Response("Not found\n", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const m = FILE.exec((await params).file);
  if (!m || !isLocale(m[4])) return missing();
  const [, kind, year, part, locale] = m;
  let svg: string | null = null;
  if (kind === "soccer") {
    if (part !== "wide" && part !== "phone") return missing();
    const t = await tournamentOfYear(Number(year));
    if (!t) return missing();
    const knockout = (await getTournamentMatches(t.tournament_id)).filter((x) => x.stage_order >= 4);
    svg = soccerBracketFile(knockout, speaker(locale), part);
  } else svg = await seasonBracketFile(kind, Number(year), locale, part as BracketPart);
  if (!svg) return missing();
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}
