import Page, { generateMetadata as meta } from "@/app/[locale]/s/city/[slug]/page";

/** The city page reads no query, but an address with a key the other pages read (?from=, ?sort=) is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export const generateMetadata = (props: PageProps<"/[locale]/q/city/[slug]">) => meta(props as unknown as PageProps<"/[locale]/s/city/[slug]">);

export default function CityQueryPage(props: PageProps<"/[locale]/q/city/[slug]">) {
  return <Page {...(props as unknown as PageProps<"/[locale]/s/city/[slug]">)} />;
}
