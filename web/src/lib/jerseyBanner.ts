/* Retired-number banners from @johnmorrisdotca/senshu-jerseys (MIT). Drawn on the
   server, so no drawing code reaches the browser. Colours are the club's, shown
   small under fair use. Credited on the team page and /terms. */
import "server-only";
import { renderBanner } from "@johnmorrisdotca/senshu-jerseys";
import { jerseyCut } from "./jerseyCut.ts";

export type BannerInput = {
  league: string;
  number: number;
  name: string;
  years?: string | null;
  primaryHex?: string | null;
  secondaryHex?: string | null;
  locale?: string;
};

function hex(v: string | null | undefined, fallback: string): string {
  const s = (v || "").replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(s) ? `#${s}` : fallback;
}

/** One retired-number banner as an SVG string. Trusted static markup; names come from the archive. */
export function retiredBannerSvg(row: BannerInput): string {
  const field = hex(row.primaryHex, "#1f3a8a");
  const trim = hex(row.secondaryHex, "#f4f0e4");
  const cut = jerseyCut(row.league);
  return renderBanner({
    shape: "rectangle",
    colors: [field, trim],
    number: row.number,
    name: row.name,
    years: row.years || undefined,
    sweater: { cut, colors: [trim, field] },
    language: row.locale === "ja" ? "ja" : "en",
    size: 160,
  });
}
