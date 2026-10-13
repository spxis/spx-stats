import Page, { generateMetadata as meta } from "@/app/[locale]/s/worldcup/[year]/page";

/** The page reads no query, but an address with a key the other pages read (?sort_games=) is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export const generateMetadata = (props: PageProps<"/[locale]/q/worldcup/[year]">) => meta(props as unknown as PageProps<"/[locale]/s/worldcup/[year]">);

export default function WorldCupYearQueryPage(props: PageProps<"/[locale]/q/worldcup/[year]">) {
  return <Page {...(props as unknown as PageProps<"/[locale]/s/worldcup/[year]">)} />;
}
