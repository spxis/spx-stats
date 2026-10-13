import type { ReactNode } from "react";

/**
 * A venue address as a plain link to Google Maps (see venueMapsUrl in lib/venueAddress.ts): a new tab, no referrer, a small arrow after it.
 * `label` is the phrase "address.openMap" for that address in the reader's language, which also tells a screen reader that the link leaves the site.
 */
export function AddressLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return <a className="addresslink" href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>{children}</a>;
}
