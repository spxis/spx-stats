import Link from "next/link";
import type { ReactNode } from "react";
import type { Speaker } from "@/lib/i18n/i18n";
import { Rich } from "./i18n/Rich";

/**
 * The links to the open dataset of home venues. The format names are the same in every language; the files and the API are plain links
 * (not pages), so they are `<a>`. No server-only code: the /venues page and the /sources page both use it.
 */
export const venueDataParts = (): Record<"csv" | "geojson" | "api", ReactNode> => ({
  csv: <a href="/venues.csv" download>CSV</a>,
  geojson: <a href="/venues.geojson">GeoJSON</a>,
  // eslint-disable-next-line @next/next/no-html-link-for-pages -- a JSON route handler, not a page: a Link would prefetch it for nothing
  api: <a href="/api/venues">API</a>,
});

/** "Download the list: CSV · GeoJSON · API. Licence and columns: Sources." (small print under the /venues heading) */
export function VenueDownload({ say }: { say: Speaker["say"] }) {
  return (
    <p className="note">
      <Rich text={say("venuesPage.download")} parts={{ ...venueDataParts(), sources: <Link href="/sources">{say("nav.sources")}</Link> }} />
    </p>
  );
}
