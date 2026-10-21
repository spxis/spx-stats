import Page, { generateMetadata as meta } from "@/app/[locale]/s/[league]/all-star/page";

/** The page reads no query, but an address with a key the other pages read is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export const generateMetadata = (props: PageProps<"/[locale]/q/[league]/all-star">) => meta(props as unknown as PageProps<"/[locale]/s/[league]/all-star">);

export default function LeagueAllStarQueryPage(props: PageProps<"/[locale]/q/[league]/all-star">) {
  return <Page {...(props as unknown as PageProps<"/[locale]/s/[league]/all-star">)} />;
}
