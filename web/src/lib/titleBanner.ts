/* Championship pennants and garden flags from @johnmorrisdotca/senshu-jerseys (MIT).
   Drawn on the server. Honour lines are English, as on the real banners. Credited with the jerseys. */
import "server-only";
import { renderTitleBanner, type TitleBannerKind } from "@johnmorrisdotca/senshu-jerseys";
import { lastNameOf } from "./lastName.ts";
import { SUPER_BOWL_SINCE } from "./leagues.ts";

export type { TitleBannerKind };

const HONOUR: Record<string, readonly [string, string]> = {
  nhl: ["STANLEY CUP", "CHAMPIONS"],
  pwhl: ["WALTER CUP", "CHAMPIONS"],
  nba: ["NBA", "CHAMPIONS"],
  wnba: ["WNBA", "CHAMPIONS"],
  mlb: ["WORLD SERIES", "CHAMPIONS"],
  nfl: ["SUPER BOWL", "CHAMPIONS"],
  cfl: ["GREY CUP", "CHAMPIONS"],
};

export type TitleInput = {
  league: string;
  years: readonly number[];
  city?: string | null;
  team?: string | null;
  primaryHex?: string | null;
  secondaryHex?: string | null;
  kind: TitleBannerKind;
  logo?: string | null;
  locale?: string;
};

function hex(v: string | null | undefined, fallback: string): string {
  const s = (v || "").replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(s) ? `#${s}` : fallback;
}

/** City and club as they go on a garden flag: "Edmonton Oilers" in Edmonton → Oilers. */
export function clubWord(team: string, city: string | null | undefined): { city?: string; club: string } {
  const t = team.trim();
  const c = (city ?? "").trim();
  if (c && t.toLowerCase().startsWith(c.toLowerCase())) {
    const rest = t.slice(c.length).trim();
    return { city: c, club: rest || t };
  }
  return { city: c || undefined, club: lastNameOf(t) };
}

export function honourOf(league: string, years: readonly number[]): readonly [string, string] {
  if (league === "nfl" && years.length > 0 && years.every((y) => y < SUPER_BOWL_SINCE)) return ["NFL", "CHAMPIONS"];
  return HONOUR[league] ?? ["CHAMPIONS", ""];
}

/** One championship pennant or garden flag as an SVG string. */
export function titleBannerSvg(row: TitleInput): string {
  const field = hex(row.primaryHex, "#041e42");
  const accent = hex(row.secondaryHex, "#ff4c00");
  const [title, subtitle] = honourOf(row.league, row.years);
  const named = clubWord(row.team ?? "", row.city);
  return renderTitleBanner({
    kind: row.kind,
    colors: [field, accent, "#ffffff"],
    title: title || undefined,
    subtitle: subtitle || undefined,
    years: row.years,
    city: row.kind === "garden" ? named.city : undefined,
    club: row.kind === "garden" ? named.club : undefined,
    ...(row.logo ? { logo: row.logo } : {}),
    language: row.locale === "ja" ? "ja" : "en",
    size: 160,
  });
}
