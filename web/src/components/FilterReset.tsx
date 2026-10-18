"use client";

import Link from "@/components/Link";
import { saveRange } from "@/lib/yearRange";

/** Clears every filter of a people list: the address goes back to the bare page, and the year range saved for it in this browser is dropped too. */
export function FilterReset({ href, label, storeKey, span }: { href: string; label: string; storeKey: string; span: { min: number; max: number } | null }) {
  return (
    <Link href={href} prefetch={false} className="filter-reset" onClick={() => span && saveRange({ from: span.min, to: span.max }, span.min, span.max, storeKey)}>
      {label}
    </Link>
  );
}
