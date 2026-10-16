import Page, { generateMetadata as meta } from "@/app/[locale]/q/[league]/[year]/leaders/page";
import { NO_QUERY } from "@/lib/noQuery";

/** The address has no query: the page as it is without one, kept and revalidated. With a query the request is drawn in q/ instead (lib/routing.ts). */
// Nothing is drawn at build time: each address is drawn on its first visit, then kept and revalidated like the rest.
export const revalidate = 2592000;
export const generateStaticParams = () => [];

export const generateMetadata = (props: PageProps<"/[locale]/s/[league]/[year]/leaders">) => meta({ ...props, searchParams: NO_QUERY });

export default function StaticPage(props: PageProps<"/[locale]/s/[league]/[year]/leaders">) {
  return <Page {...props} searchParams={NO_QUERY} />;
}
