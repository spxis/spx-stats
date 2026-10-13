import Page, { generateMetadata as meta } from "@/app/[locale]/s/country/[code]/page";

/** The country page reads no query, but an address with a key the other pages read (?sort=, ?from=) is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export const generateMetadata = (props: PageProps<"/[locale]/q/country/[code]">) => meta(props as unknown as PageProps<"/[locale]/s/country/[code]">);

export default function CountryQueryPage(props: PageProps<"/[locale]/q/country/[code]">) {
  return <Page {...(props as unknown as PageProps<"/[locale]/s/country/[code]">)} />;
}
