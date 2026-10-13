import Page, { generateMetadata as meta } from "@/app/[locale]/s/[league]/world/page";

/** The league world page reads no query, but an address with a key the other pages read (?sort=, ?from=) is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export const generateMetadata = (props: PageProps<"/[locale]/q/[league]/world">) => meta(props as unknown as PageProps<"/[locale]/s/[league]/world">);

export default function LeagueWorldQueryPage(props: PageProps<"/[locale]/q/[league]/world">) {
  return <Page {...(props as unknown as PageProps<"/[locale]/s/[league]/world">)} />;
}
