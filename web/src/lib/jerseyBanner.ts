/* Retired-number banners from @johnmorrisdotca/senshu-jerseys (MIT). Drawn on the
   server, so no drawing code reaches the browser. Colours are the club's, shown
   small under fair use. Credited on the team page and /terms. */
import "server-only";
import { renderBanner } from "@johnmorrisdotca/senshu-jerseys";
import { jerseyCut } from "./jerseyCut.ts";
import { lastNameOf } from "./lastName.ts";

export type BannerKind = "rafter" | "hanging";

export type BannerInput = {
  league: string;
  number: number;
  name: string;
  years?: string | null;
  primaryHex?: string | null;
  secondaryHex?: string | null;
  locale?: string;
  /** `"hanging"` is the plate (last name, number, optional logo, no years). Franchise pages use `"rafter"`. */
  kind?: BannerKind;
  /** Caller-supplied logo for a hanging banner: SVG, data URI, or http(s)/root-relative image. */
  logo?: string | null;
};

function hex(v: string | null | undefined, fallback: string): string {
  const s = (v || "").replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(s) ? `#${s}` : fallback;
}

function lum(hex6: string): number {
  const c = [0, 2, 4]
    .map((i) => parseInt(hex6.slice(i + 1, i + 3), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** One retired-number banner as an SVG string. Trusted static markup; names come from the archive. */
export function retiredBannerSvg(row: BannerInput): string {
  const field = hex(row.primaryHex, "#1f3a8a");
  const accent = hex(row.secondaryHex, "#f4f0e4");
  const cut = jerseyCut(row.league);
  const last = lastNameOf(row.name);
  const hanging = row.kind === "hanging";
  const light = lum(accent) > 0.55 ? accent : "#f4f0e4";
  return renderBanner({
    kind: hanging ? "hanging" : "rafter",
    shape: "rectangle",
    colors: hanging ? [field, light, accent] : [field, accent],
    number: row.number,
    name: last,
    years: hanging ? undefined : row.years || undefined,
    sweater: hanging ? false : { cut, colors: [accent, field] },
    ...(hanging && row.logo ? { logo: row.logo } : {}),
    language: row.locale === "ja" ? "ja" : "en",
    size: 160,
  });
}
