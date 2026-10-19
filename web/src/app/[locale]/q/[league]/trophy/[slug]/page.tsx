import Page, { generateMetadata as meta } from "@/app/[locale]/s/[league]/trophy/[slug]/page";

/** The page reads no query, but an address with a key the other pages read is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export const generateMetadata = (props: PageProps<"/[locale]/q/[league]/trophy/[slug]">) => meta(props as unknown as PageProps<"/[locale]/s/[league]/trophy/[slug]">);

export default function TrophyQueryPage(props: PageProps<"/[locale]/q/[league]/trophy/[slug]">) {
  return <Page {...(props as unknown as PageProps<"/[locale]/s/[league]/trophy/[slug]">)} />;
}
