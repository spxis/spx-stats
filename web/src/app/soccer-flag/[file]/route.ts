import { flag } from "@johnmorrisdotca/hata/load";
import { HATA_SHAPE, sizeFlagSvg } from "@/lib/flagSvg";

// One national team's flag as its own file (/soccer-flag/ES.svg round, /soccer-flag/ES.rect.svg in its own proportions, /soccer-flag/GB-ENG.svg): what kyogijo's round team mark and pageant carpet take as the team's picture
// (the ends of a match's pitch, and the road to the final), because kyogijo names an image by address and cannot point into the sprite
// (/soccer-flags-round.svg, components/SoccerFlag.tsx). Only a page that draws the flag loads it (Spain's and Mexico's drawings are about 80 KB), kept a day.
// The drawing is Hata's own round frame, as everywhere else; the ring around it is kyogijo's mark. No query is read; a name that is not a flag code is a 404.
export const revalidate = 86400;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const FILE = /^([A-Za-z]{2}(?:-[A-Za-z]{3})?)(\.rect)?\.svg$/;
const missing = () => new Response("Not found\n", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const m = FILE.exec((await params).file);
  if (!m) return missing();
  const shape = m[2] ? "rect" : "round";
  const svg = await flag(m[1].toUpperCase(), HATA_SHAPE[shape]).catch(() => null);
  if (!svg) return missing();
  return new Response(sizeFlagSvg(svg, shape), {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=86400, s-maxage=86400" },
  });
}
