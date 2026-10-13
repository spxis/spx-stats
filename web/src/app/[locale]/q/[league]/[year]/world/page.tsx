import Page, { generateMetadata as meta } from "@/app/[locale]/s/[league]/[year]/world/page";

/** The season's world page reads no query, but an address with a key the other pages read (?sort=) is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export const generateMetadata = (props: PageProps<"/[locale]/q/[league]/[year]/world">) => meta(props as unknown as PageProps<"/[locale]/s/[league]/[year]/world">);

export default function SeasonWorldQueryPage(props: PageProps<"/[locale]/q/[league]/[year]/world">) {
  return <Page {...(props as unknown as PageProps<"/[locale]/s/[league]/[year]/world">)} />;
}
