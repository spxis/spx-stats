import { NextResponse } from "next/server";
import { z } from "zod";
import { rows } from "@/lib/api/client";
import { brandFor, groupBrands, logoFor } from "@/lib/brand";
import { teamBrandSchema } from "@/lib/api/schemas";
import { logoPayload } from "@/lib/embedLogo";
import { lastNameOf } from "@/lib/lastName";
import { retiredBannerSvg } from "@/lib/jerseyBanner";

export const revalidate = 86400;
export const dynamicParams = true;
export const generateStaticParams = () => [];

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

/** Embed a public logo so a hanging banner used as `<img>` can show it (SVG-as-image cannot load external hrefs). */
async function embedLogo(url: string | null, origin: string): Promise<string | undefined> {
  if (!url) return undefined;
  const abs = url.startsWith("/") ? new URL(url, origin).href : url;
  if (!/^https?:\/\//i.test(abs)) return undefined;
  try {
    const res = await fetch(abs, {
      signal: AbortSignal.timeout(4000),
      headers: { "User-Agent": "spx-stats/jersey-banner (https://spxn.com; john@johnmorris.ca)" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return undefined;
    return logoPayload(Buffer.from(await res.arrayBuffer()), res.headers.get("content-type") || "");
  } catch {
    return undefined;
  }
}

/** One retired-number banner as SVG, in the franchise's colours. Kept a day. `?kind=hanging` is the plate variant. */
export async function GET(req: Request, { params }: { params: Promise<{ franchise: string; id: string }> }) {
  const { franchise, id } = await params;
  const f = Number(franchise);
  const n = Number(id);
  if (!Number.isInteger(f) || f <= 0 || !Number.isInteger(n) || n <= 0) {
    return new NextResponse("not found", { status: 404 });
  }
  const hanging = new URL(req.url).searchParams.get("kind") === "hanging";
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
  const logo = hanging ? await embedLogo(logoFor(grouped, f), new URL(req.url).origin) : undefined;
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
