import { pitchFiles, surfaceFile, surfaceFiles } from "@/lib/venueDraw";

// The drawings of playing surfaces that the venue pages show (lib/venueDraw.ts): one file for each sport and each ballpark, made at build and
// kept, so a venue page names them with an <img> instead of carrying the SVG in its HTML and again in its data. A soccer pitch is a file of its
// own size (pitch-105x68.en.svg, to the half metre): the standard one is made at build, the others on their first request and then kept for a day.
// No query is read; a name that is no drawing (a size no football pitch has, an unknown sport or era) is a 404.
export const generateStaticParams = () => [...surfaceFiles(), ...pitchFiles()].map((file) => ({ file }));

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const svg = surfaceFile((await params).file);
  if (!svg) return new Response("Not found\n", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=86400, s-maxage=86400" } });
}
