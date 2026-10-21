import Page, { generateMetadata as meta } from "@/app/[locale]/s/[league]/all-star/[year]/page";

/** The page reads no query, but an address with a key the other pages read is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export const generateMetadata = (props: PageProps<"/[locale]/q/[league]/all-star/[year]">) => meta(props as unknown as PageProps<"/[locale]/s/[league]/all-star/[year]">);

export default function LeagueAllStarYearQueryPage(props: PageProps<"/[locale]/q/[league]/all-star/[year]">) {
  return <Page {...(props as unknown as PageProps<"/[locale]/s/[league]/all-star/[year]">)} />;
}
