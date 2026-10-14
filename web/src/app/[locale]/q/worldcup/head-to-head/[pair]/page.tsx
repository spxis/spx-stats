import Page, { generateMetadata as meta } from "@/app/[locale]/s/worldcup/head-to-head/[pair]/page";

/** The page reads no query, but an address with a key the other pages read (?sort_men=) is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export const generateMetadata = (props: PageProps<"/[locale]/q/worldcup/head-to-head/[pair]">) => meta(props as unknown as PageProps<"/[locale]/s/worldcup/head-to-head/[pair]">);

export default function HeadToHeadQueryPage(props: PageProps<"/[locale]/q/worldcup/head-to-head/[pair]">) {
  return <Page {...(props as unknown as PageProps<"/[locale]/s/worldcup/head-to-head/[pair]">)} />;
}
