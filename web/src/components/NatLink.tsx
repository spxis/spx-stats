"use client";

import Link from "@/components/Link";
import { FlagIcon } from "./FlagIcon";

/**
 * A player's country in a list: its flag, as a link that filters the list to that country (the link's tooltip names the country, so the flag is
 * decoration). One client component for the pair: a page of a hundred players held a link and a flag for each as server markup, twice, and this is
 * a short reference to the pair. `code` is null for a country Hata has no flag for (the link is then empty, as before).
 */
export function NatLink({ href, title, code }: { href: string; title: string; code: string | null }) {
  return <Link href={href} prefetch={false} title={title}>{code ? <FlagIcon code={code} /> : null}</Link>;
}
