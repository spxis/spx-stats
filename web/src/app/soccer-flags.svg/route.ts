import { flag } from "@johnmorrisdotca/hata/load";
import { getSoccerTeams } from "@/lib/soccer";
import { flagSymbolId } from "@/lib/soccerFlagSprite";

// One SVG with a <symbol> for the flag of every national team in the archive, so the World Cup pages draw each flag once (components/SoccerFlag.tsx).
// Hata's own ids are prefixed per flag, so the symbols never clash. Kept an hour like the pages; no query is read.
export const revalidate = 3600;

export async function GET() {
  try {
    const codes = [...new Set((await getSoccerTeams()).map((t) => t.flag_code).filter((c): c is string => !!c).map((c) => c.toUpperCase()))].sort();
    const symbols = (await Promise.all(codes.map(async (code) => {
      const svg = await flag(code).catch(() => null);
      const m = svg ? /<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/.exec(svg) : null;
      const viewBox = m ? /\sviewBox="([^"]*)"/.exec(m[1])?.[1] : undefined;
      return m && viewBox ? `<symbol id="${flagSymbolId(code)}" viewBox="${viewBox}">${m[2]}</symbol>` : "";
    }))).join("");
    return new Response(`<svg xmlns="http://www.w3.org/2000/svg"><defs>${symbols}</defs></svg>`, {
      headers: { "Content-Type": "image/svg+xml; charset=utf-8", "X-Content-Type-Options": "nosniff" },
    });
  } catch (e) {
    console.error(e);
    return new Response("The archive could not be read. Try again shortly.\n", { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}
