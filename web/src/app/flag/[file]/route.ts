import { flag } from "@johnmorrisdotca/hata/load";
import { FLAG_FILE, HATA_SHAPE, sizeFlagSvg } from "@/lib/flagSvg";

// One flag as its own file (/flag/CA.svg, /flag/CA.round.svg, /flag/CA.square.svg, /flag/GB-ENG.svg): what every flag on the site is an image of
// (components/FlagIcon.tsx), so a page holds a few bytes of address where it used to hold the drawing (Spain's is 110 KB) in its markup and again in
// its payload. Hata's own frames for the round and square shapes. No query is read; a name that is not a flag is a 404. A flag does not change, so
// the file is kept a week by the browser and by Vercel.
export const revalidate = 604800;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const missing = () => new Response("Not found\n", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const m = FLAG_FILE.exec((await params).file);
  if (!m) return missing();
  const shape = (m[2] ?? "rect") as keyof typeof HATA_SHAPE;
  const svg = await flag(m[1].toUpperCase(), HATA_SHAPE[shape]).catch(() => null);
  if (!svg) return missing();
  return new Response(sizeFlagSvg(svg, shape), {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=604800, s-maxage=604800" },
  });
}
