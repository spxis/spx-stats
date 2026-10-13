import Page, { generateMetadata as meta } from "@/app/[locale]/s/mls/[year]/page";

/** The page reads no query, but an address with a key the other pages read (?sort_games=) is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export const generateMetadata = (props: PageProps<"/[locale]/q/mls/[year]">) => meta(props as unknown as PageProps<"/[locale]/s/mls/[year]">);

export default function MlsYearQueryPage(props: PageProps<"/[locale]/q/mls/[year]">) {
  return <Page {...(props as unknown as PageProps<"/[locale]/s/mls/[year]">)} />;
}
