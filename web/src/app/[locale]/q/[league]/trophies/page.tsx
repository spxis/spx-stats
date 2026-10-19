import Page, { generateMetadata as meta } from "@/app/[locale]/s/[league]/trophies/page";

/** The page reads no query, but an address with a key the other pages read is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export const generateMetadata = (props: PageProps<"/[locale]/q/[league]/trophies">) => meta(props as unknown as PageProps<"/[locale]/s/[league]/trophies">);

export default function LeagueTrophiesQueryPage(props: PageProps<"/[locale]/q/[league]/trophies">) {
  return <Page {...(props as unknown as PageProps<"/[locale]/s/[league]/trophies">)} />;
}
