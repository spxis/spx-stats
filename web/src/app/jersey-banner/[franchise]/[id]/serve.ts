import { NextResponse } from "next/server";
import { z } from "zod";
import { rows } from "@/lib/api/client";
import { brandFor, groupBrands, logoFor } from "@/lib/brand";
import { teamBrandSchema } from "@/lib/api/schemas";
import { fetchLogo } from "@/lib/embedLogo";
import { lastNameOf } from "@/lib/lastName";
import { retiredBannerSvg, type BannerKind } from "@/lib/jerseyBanner";

const SITE = "https://spxn.com";

const retiredSchema = z.object({
  retired_number_id: z.number(),
  league: z.string(),
  franchise_id: z.number().nullable(),
  jersey_number: z.number(),
  name: z.string().nullable(),
  honor_name: z.string().nullable(),
  retired_on: z.string().nullable(),
  tenure_text: z.string().nullable(),
});

function yearsOf(tenure: string | null, retiredOn: string | null): string | undefined {
  if (tenure) return tenure;
  if (retiredOn && /^\d{4}/.test(retiredOn)) return retiredOn.slice(0, 4);
  return undefined;
}

/** Draw one retired-number banner. No `request.url`, so the kept route can prerender. */
export async function serveRetiredBanner(
  franchise: string,
  id: string,
  kind: BannerKind,
): Promise<NextResponse> {
  const f = Number(franchise);
  const n = Number(id);
  if (!Number.isInteger(f) || f <= 0 || !Number.isInteger(n) || n <= 0) {
    return new NextResponse("not found", { status: 404 });
  }
  const hanging = kind === "hanging";
  const [list, brands] = await Promise.all([
    rows("retired_number", `retired_number_id=eq.${n}&select=retired_number_id,league,franchise_id,jersey_number,name,honor_name,retired_on,tenure_text`, retiredSchema).catch(() => []),
    rows("team_brand", `franchise_id=eq.${f}&select=*&order=brand_from.nullsfirst`, teamBrandSchema).catch(() => []),
  ]);
  const row = list[0];
  if (!row || (row.franchise_id != null && row.franchise_id !== f)) {
    return new NextResponse("not found", { status: 404 });
  }
  const grouped = groupBrands(brands);
  const b = brandFor(grouped, f);
  const full = row.name || row.honor_name || String(row.jersey_number);
  const logo = hanging ? await fetchLogo(logoFor(grouped, f), SITE) : undefined;
  const svg = retiredBannerSvg({
    league: row.league,
    number: row.jersey_number,
    name: lastNameOf(full),
    years: yearsOf(row.tenure_text, row.retired_on),
    primaryHex: b?.primary_hex,
    secondaryHex: b?.secondary_hex,
    kind: hanging ? "hanging" : "rafter",
    logo,
  });
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
}
