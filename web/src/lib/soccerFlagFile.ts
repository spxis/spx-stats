import "server-only";
import { flag } from "@johnmorrisdotca/hata/load";
import { HATA_SHAPE } from "./flagSvg";
import { getSoccerTeams } from "./soccer";
import { flagSymbolId, type SoccerFlagShape } from "./soccerFlagSprite";

/**
 * One SVG with a <symbol> for the flag of every national team in the archive, in one shape, so the World Cup pages draw each flag once
 * (components/SoccerFlag.tsx). Hata's own ids are prefixed per flag, so the symbols never clash; the round frame's clip circle has the same
 * id in every flag, so it is renamed per symbol to keep every id in the file unique. The round shape is Hata's own frame, never clipped here.
 */
export async function soccerFlagFile(shape: SoccerFlagShape): Promise<Response> {
  try {
    const codes = [...new Set((await getSoccerTeams()).map((t) => t.flag_code).filter((c): c is string => !!c).map((c) => c.toUpperCase()))].sort();
    const symbols = (await Promise.all(codes.map(async (code) => {
      const svg = await flag(code, HATA_SHAPE[shape]).catch(() => null);
      const m = svg ? /<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/.exec(svg) : null;
      const viewBox = m ? /\sviewBox="([^"]*)"/.exec(m[1])?.[1] : undefined;
      if (!m || !viewBox) return "";
      const body = shape === "round" ? m[2].replace(/hata-round-[a-z0-9]+/g, `hata-round-${code.toLowerCase()}`) : m[2];
      return `<symbol id="${flagSymbolId(code, shape)}" viewBox="${viewBox}">${body}</symbol>`;
    }))).join("");
    return new Response(`<svg xmlns="http://www.w3.org/2000/svg"><defs>${symbols}</defs></svg>`, {
      headers: { "Content-Type": "image/svg+xml; charset=utf-8", "X-Content-Type-Options": "nosniff" },
    });
  } catch (e) {
    console.error(e);
    return new Response("The archive could not be read. Try again shortly.\n", { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}
