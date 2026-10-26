import Page, { generateMetadata as meta } from "@/app/[locale]/s/soccer/[league]/[season]/page";

/** The page reads no query, but an address with a key the other pages read (?sort_teams=) is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export const generateMetadata = (props: PageProps<"/[locale]/q/soccer/[league]/[season]">) => meta(props as unknown as PageProps<"/[locale]/s/soccer/[league]/[season]">);

export default function EuropeSeasonQueryPage(props: PageProps<"/[locale]/q/soccer/[league]/[season]">) {
  return <Page {...(props as unknown as PageProps<"/[locale]/s/soccer/[league]/[season]">)} />;
}
