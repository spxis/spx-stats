import Page, { generateMetadata as meta } from "@/app/[locale]/s/mls/team/[slug]/page";

/** The page reads no query, but an address with a key the other pages read (?sort_games=) is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export const generateMetadata = (props: PageProps<"/[locale]/q/mls/team/[slug]">) => meta(props as unknown as PageProps<"/[locale]/s/mls/team/[slug]">);

export default function MlsClubQueryPage(props: PageProps<"/[locale]/q/mls/team/[slug]">) {
  return <Page {...(props as unknown as PageProps<"/[locale]/s/mls/team/[slug]">)} />;
}
