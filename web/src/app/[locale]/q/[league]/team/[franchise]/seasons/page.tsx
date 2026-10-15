import Page, { generateMetadata as meta } from "@/app/[locale]/s/[league]/team/[franchise]/seasons/page";

/** The page reads no query, but an address with a key the other pages read is routed to q/ (lib/routing.ts): the same page, drawn for the request. */
export const generateMetadata = (props: PageProps<"/[locale]/q/[league]/team/[franchise]/seasons">) => meta(props as unknown as PageProps<"/[locale]/s/[league]/team/[franchise]/seasons">);

export default function TeamSeasonsQueryPage(props: PageProps<"/[locale]/q/[league]/team/[franchise]/seasons">) {
  return <Page {...(props as unknown as PageProps<"/[locale]/s/[league]/team/[franchise]/seasons">)} />;
}
