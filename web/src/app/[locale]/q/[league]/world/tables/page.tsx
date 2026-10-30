import Page, { generateMetadata as meta } from "@/app/[locale]/s/[league]/world/tables/page";

/** The page reads no query, but an address with a key the other pages read is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export const generateMetadata = (props: PageProps<"/[locale]/q/[league]/world/tables">) => meta(props as unknown as PageProps<"/[locale]/s/[league]/world/tables">);

export default function LeagueWorldTablesQueryPage(props: PageProps<"/[locale]/q/[league]/world/tables">) {
  return <Page {...(props as unknown as PageProps<"/[locale]/s/[league]/world/tables">)} />;
}
