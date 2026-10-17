import { serveRetiredBanner } from "./serve";

export const revalidate = 86400;
export const dynamicParams = true;
export const generateStaticParams = () => [];

/** One retired-number banner as SVG, in the franchise's colours. Kept a day. */
export async function GET(_req: Request, { params }: { params: Promise<{ franchise: string; id: string }> }) {
  const { franchise, id } = await params;
  return serveRetiredBanner(franchise, id, "rafter");
}
