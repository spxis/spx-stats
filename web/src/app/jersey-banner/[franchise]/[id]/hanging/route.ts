import { serveRetiredBanner } from "../serve";

export const revalidate = 86400;
export const dynamicParams = true;
export const generateStaticParams = () => [];

/** Hanging-plate variant: last name, number, club logo, no years. Kept a day. */
export async function GET(_req: Request, { params }: { params: Promise<{ franchise: string; id: string }> }) {
  const { franchise, id } = await params;
  return serveRetiredBanner(franchise, id, "hanging");
}
