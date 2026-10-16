import type { Metadata } from "next";
import type { ReactNode } from "react";
import { QUERY_ROBOTS } from "@/lib/queryLink";

/** Every q/ copy is a query variant: do not index it, and do not follow its links. The kept twin in s/ is the one to crawl. */
export const metadata: Metadata = { robots: QUERY_ROBOTS };

export default function QueryLayout({ children }: { children: ReactNode }) {
  return children;
}
