import Page, { generateMetadata as meta } from "@/app/[locale]/s/[league]/awards/page";

/** The page reads no query, but an address with a key the other pages read is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export const generateMetadata = (props: PageProps<"/[locale]/q/[league]/awards">) => meta(props as unknown as PageProps<"/[locale]/s/[league]/awards">);

export default function LeagueAwardsQueryPage(props: PageProps<"/[locale]/q/[league]/awards">) {
  return <Page {...(props as unknown as PageProps<"/[locale]/s/[league]/awards">)} />;
}
