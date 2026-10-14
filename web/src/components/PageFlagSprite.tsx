import { flag } from "@johnmorrisdotca/hata/load";
import { pageFlagId } from "./PageFlag";

/**
 * The flags a list draws, once, as symbols of a zero-size SVG at the top of the page (PageFlag points at them with `<use href="#pf-ca">`). A list of a
 * few hundred rows with two or three countries would otherwise repeat each flag's drawing on every row. Give it only the countries the list holds:
 * some of Hata's drawings with a coat of arms are over 100 KB. Hata's ids are prefixed per flag, so the symbols never clash. A code Hata lacks is left out.
 */
export async function PageFlagSprite({ codes }: { codes: readonly string[] }) {
  const symbols = (await Promise.all([...new Set(codes.map((c) => c.toUpperCase()))].sort().map(async (code) => {
    const svg = await flag(code).catch(() => null);
    const m = svg ? /<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/.exec(svg) : null;
    const viewBox = m ? /\sviewBox="([^"]*)"/.exec(m[1])?.[1] : undefined;
    return m && viewBox ? `<symbol id="${pageFlagId(code)}" viewBox="${viewBox}">${m[2]}</symbol>` : "";
  }))).join("");
  if (!symbols) return null;
  return <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }} dangerouslySetInnerHTML={{ __html: `<defs>${symbols}</defs>` }} />;
}
