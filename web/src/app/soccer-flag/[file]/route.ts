import { flag } from "@johnmorrisdotca/hata/load";
import { HATA_SHAPE, sizeFlagSvg } from "@/lib/flagSvg";

// One national team's round flag as its own file (/soccer-flag/ES.svg, /soccer-flag/GB-ENG.svg): what the kyogijo strip under a match's pitch takes as the team's
// logo, because the strip names an image by address and cannot point into the sprite (/soccer-flags-round.svg, components/SoccerFlag.tsx). Only a page that draws
// the flag loads it (Spain's and Mexico's drawings are about 80 KB), kept a day. The drawing is Hata's own round frame, as everywhere else. No query is read; a
// name that is not a flag code is a 404.
export const revalidate = 86400;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const FILE = /^([A-Za-z]{2}(?:-[A-Za-z]{3})?)\.svg$/;
const missing = () => new Response("Not found\n", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const m = FILE.exec((await params).file);
  if (!m) return missing();
  const svg = await flag(m[1].toUpperCase(), HATA_SHAPE.round).catch(() => null);
  if (!svg) return missing();
  // The strip draws the flag straight onto the team's colour block, and a flag whose stripes are the block's own colour (Spain's red, Argentina's sky blue)
  // would lose its edge there: a thin white ring keeps the circle (inside Hata's own round frame, so the flag is never cropped).
  const box = /\sviewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg);
  const side = box ? Number(box[1]) : 0, ring = side * 0.05;
  const body = box && Number(box[2]) === side ? svg.replace(/<\/svg>\s*$/, `<circle cx="${side / 2}" cy="${side / 2}" r="${side / 2 - ring / 2}" fill="none" stroke="#fff" stroke-opacity=".92" stroke-width="${ring}"/></svg>`) : svg;
  return new Response(sizeFlagSvg(body, "round"), {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=86400, s-maxage=86400" },
  });
}
