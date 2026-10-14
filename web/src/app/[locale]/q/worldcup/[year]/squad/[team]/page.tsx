import Page, { generateMetadata as meta } from "@/app/[locale]/s/worldcup/[year]/squad/[team]/page";

/** The page reads no query, but an address with a key the other pages read is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export const generateMetadata = (props: PageProps<"/[locale]/q/worldcup/[year]/squad/[team]">) => meta(props as unknown as PageProps<"/[locale]/s/worldcup/[year]/squad/[team]">);

export default function WorldCupSquadQueryPage(props: PageProps<"/[locale]/q/worldcup/[year]/squad/[team]">) {
  return <Page {...(props as unknown as PageProps<"/[locale]/s/worldcup/[year]/squad/[team]">)} />;
}
