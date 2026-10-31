import NextLink from "next/link";
import type { ComponentProps } from "react";
import { queryFollowRel } from "@/lib/queryLink";

type Props = ComponentProps<typeof NextLink>;

/**
 * next/link, with rel=nofollow on addresses the router draws from q/ (lib/queryLink.ts). Prefetch is off unless the
 * caller turns it on (null turns Next's default on): a long table of links must not pull dozens of pages for one reader. The header menu fetches on
 * intent only (IntentLink).
 */
export default function Link({ href, rel, prefetch, ...rest }: Props) {
  const extra = queryFollowRel(href);
  const joined = [rel, extra].filter(Boolean).join(" ") || undefined;
  return <NextLink href={href} rel={joined} prefetch={prefetch === undefined ? false : prefetch} {...rest} />;
}
