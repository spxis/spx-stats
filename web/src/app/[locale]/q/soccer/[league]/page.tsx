import Page, { generateMetadata as meta } from "@/app/[locale]/s/soccer/[league]/page";

/** The page reads no query, but an address with a key the other pages read (?sort_seasons=) is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export const generateMetadata = (props: PageProps<"/[locale]/q/soccer/[league]">) => meta(props as unknown as PageProps<"/[locale]/s/soccer/[league]">);

export default function EuropeLeagueQueryPage(props: PageProps<"/[locale]/q/soccer/[league]">) {
  return <Page {...(props as unknown as PageProps<"/[locale]/s/soccer/[league]">)} />;
}
