import Page, { generateMetadata as meta } from "@/app/[locale]/s/venue/[slug]/page";

/** The venue page reads no query, but an address with a key the other pages read (?from=, ?sort=) is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export const generateMetadata = (props: PageProps<"/[locale]/q/venue/[slug]">) => meta(props as unknown as PageProps<"/[locale]/s/venue/[slug]">);

export default function VenueQueryPage(props: PageProps<"/[locale]/q/venue/[slug]">) {
  return <Page {...(props as unknown as PageProps<"/[locale]/s/venue/[slug]">)} />;
}
