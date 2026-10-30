"use client";

import Link from "@/components/Link";

/**
 * A run of plain links from [address, text] pairs. The footer's link columns are drawn this way: a pair is about a fifth of the bytes of a link
 * element in the page's payload, and the footer rides on every page.
 */
export function LinkList({ links }: { links: readonly (readonly [href: string, text: string])[] }) {
  return links.map(([href, text]) => <Link key={href} href={href}>{text}</Link>);
}
