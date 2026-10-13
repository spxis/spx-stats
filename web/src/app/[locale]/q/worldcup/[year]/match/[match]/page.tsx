import Page, { generateMetadata as meta } from "@/app/[locale]/s/worldcup/[year]/match/[match]/page";

/** The page reads no query, but an address with a key the other pages read (?sort_games=) is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export const generateMetadata = (props: PageProps<"/[locale]/q/worldcup/[year]/match/[match]">) => meta(props as unknown as PageProps<"/[locale]/s/worldcup/[year]/match/[match]">);

export default function WorldCupMatchQueryPage(props: PageProps<"/[locale]/q/worldcup/[year]/match/[match]">) {
  return <Page {...(props as unknown as PageProps<"/[locale]/s/worldcup/[year]/match/[match]">)} />;
}
