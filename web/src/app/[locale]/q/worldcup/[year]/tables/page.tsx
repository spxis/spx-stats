import Page, { generateMetadata as meta } from "@/app/[locale]/s/worldcup/[year]/tables/page";

/** The page reads no query, but an address with a key the other pages read (?sort_games=) is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export const generateMetadata = (props: PageProps<"/[locale]/q/worldcup/[year]/tables">) => meta(props as unknown as PageProps<"/[locale]/s/worldcup/[year]/tables">);

export default function WorldCupTablesQueryPage(props: PageProps<"/[locale]/q/worldcup/[year]/tables">) {
  return <Page {...(props as unknown as PageProps<"/[locale]/s/worldcup/[year]/tables">)} />;
}
