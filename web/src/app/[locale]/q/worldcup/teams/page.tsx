import Page, { generateMetadata } from "@/app/[locale]/s/worldcup/teams/page";

/** The page reads no query, but an address with a key the other pages read (?sort_men=) is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export { generateMetadata };

export default function WorldCupTeamsQueryPage() {
  return <Page />;
}
