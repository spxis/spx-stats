import Page, { generateMetadata as meta } from "@/app/[locale]/s/mls/[year]/matches/page";

/** The page reads no query, but an address with a key the other pages read (?sort_games=) is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export const generateMetadata = (props: PageProps<"/[locale]/q/mls/[year]/matches">) => meta(props as unknown as PageProps<"/[locale]/s/mls/[year]/matches">);

export default function MlsMatchesQueryPage(props: PageProps<"/[locale]/q/mls/[year]/matches">) {
  return <Page {...(props as unknown as PageProps<"/[locale]/s/mls/[year]/matches">)} />;
}
