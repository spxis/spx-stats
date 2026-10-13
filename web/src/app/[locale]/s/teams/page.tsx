import Page, { generateMetadata as meta } from "@/app/[locale]/q/teams/page";
import { NO_QUERY } from "@/lib/noQuery";

/** The address has no query: the page as it is without one, kept and revalidated. With a query the request is drawn in q/ instead (lib/routing.ts). */
export const generateMetadata = (props: PageProps<"/[locale]/s/teams">) => meta({ ...props, searchParams: NO_QUERY });

export default function StaticPage(props: PageProps<"/[locale]/s/teams">) {
  return <Page {...props} searchParams={NO_QUERY} />;
}
