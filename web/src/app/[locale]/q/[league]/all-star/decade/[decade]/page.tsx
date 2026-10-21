import Page, { generateMetadata as meta } from "@/app/[locale]/s/[league]/all-star/decade/[decade]/page";

/** The page reads no query, but an address with a key the other pages read is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export const generateMetadata = (props: PageProps<"/[locale]/q/[league]/all-star/decade/[decade]">) => meta(props as unknown as PageProps<"/[locale]/s/[league]/all-star/decade/[decade]">);

export default function LeagueAllStarDecadeQueryPage(props: PageProps<"/[locale]/q/[league]/all-star/decade/[decade]">) {
  return <Page {...(props as unknown as PageProps<"/[locale]/s/[league]/all-star/decade/[decade]">)} />;
}
