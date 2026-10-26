import Page, { generateMetadata as meta } from "@/app/[locale]/s/soccer/club/[slug]/page";

/** The page reads no query, but an address with a key the other pages read (?sort_past=) is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export const generateMetadata = (props: PageProps<"/[locale]/q/soccer/club/[slug]">) => meta(props as unknown as PageProps<"/[locale]/s/soccer/club/[slug]">);

export default function EuropeClubQueryPage(props: PageProps<"/[locale]/q/soccer/club/[slug]">) {
  return <Page {...(props as unknown as PageProps<"/[locale]/s/soccer/club/[slug]">)} />;
}
