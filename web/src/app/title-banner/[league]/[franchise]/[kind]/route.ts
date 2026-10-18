import { NextResponse } from "next/server";
import { brandFor, groupBrands, logoFor } from "@/lib/brand";
import { teamBrandSchema } from "@/lib/api/schemas";
import { rows } from "@/lib/api/client";
import { cupTitlesOf } from "@/lib/cup";
import { getCupTitles } from "@/lib/cupData";
import { getClubCity } from "@/lib/cityData";
import { getTeam } from "@/lib/data";
import { fetchLogo } from "@/lib/embedLogo";
import { championshipYear, isLeague, SITE_URL } from "@/lib/leagues";
import { TITLE_BANNER_KINDS, type TitleBannerKind } from "@johnmorrisdotca/senshu-jerseys";
import { titleBannerSvg } from "@/lib/titleBanner";

export const revalidate = 86400;
export const dynamicParams = true;
export const generateStaticParams = () => [];

function kindOf(raw: string): TitleBannerKind | null {
  return (TITLE_BANNER_KINDS as readonly string[]).includes(raw) ? (raw as TitleBannerKind) : null;
}

/** A championship pennant or garden flag in the franchise's colours. Kept a day. */
export async function GET(_req: Request, { params }: { params: Promise<{ league: string; franchise: string; kind: string }> }) {
  const { league, franchise, kind: raw } = await params;
  const f = Number(franchise);
  const kind = kindOf(raw);
  if (!isLeague(league) || !Number.isInteger(f) || f <= 0 || kind == null) {
    return new NextResponse("not found", { status: 404 });
  }
  const [t, brands, city] = await Promise.all([
    getTeam(league, f),
    rows("team_brand", `franchise_id=eq.${f}&select=*&order=brand_from.nullsfirst`, teamBrandSchema).catch(() => []),
    getClubCity(league, f),
  ]);
  if (!t) return new NextResponse("not found", { status: 404 });
  const cup = league === "nhl" ? cupTitlesOf(await getCupTitles(), f) : [];
  const years = [...cup.map((c) => c.year), ...t.titles.map((y) => championshipYear(league, y))];
  if (!years.length) return new NextResponse("not found", { status: 404 });
  const grouped = groupBrands(brands);
  const b = brandFor(grouped, f);
  const logo = await fetchLogo(logoFor(grouped, f), SITE_URL);
  const svg = titleBannerSvg({
    league,
    years,
    city: city?.name ?? null,
    team: t.names.at(-1)?.name ?? null,
    primaryHex: b?.primary_hex,
    secondaryHex: b?.secondary_hex,
    kind,
    logo,
  });
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
}
