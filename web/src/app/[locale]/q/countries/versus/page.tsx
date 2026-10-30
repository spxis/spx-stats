import Page, { generateMetadata as meta } from "@/app/[locale]/s/countries/versus/page";

/** The page reads no query, but an address with a key the other pages read is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export const generateMetadata = () => meta(undefined);

export default function CountriesVersusQueryPage() {
  return <Page />;
}
