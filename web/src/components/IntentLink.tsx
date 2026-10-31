"use client";

import { useEffect, useRef, useState } from "react";
import type { ComponentProps, FocusEvent, MouseEvent, TouchEvent } from "react";
import Link from "@/components/Link";

/** How long the pointer rests on a link before the page behind it is fetched. A sweep across the menu passes every link and fetches none. */
export const INTENT_DWELL_MS = 120;

/**
 * A link that fetches its page ahead of the click only when the reader shows intent: the pointer rests on it, it takes keyboard focus, or a finger touches it.
 * Next's own prefetch fetches every link in view as soon as the page loads, and the header menu has a dozen of them: on every page view that was two requests each
 * (the route, then the whole page, 25 to 150 KB), all through the proxy, for pages the reader mostly never opens. A link nobody points at costs nothing now;
 * a pointer takes about a quarter of a second to get from "over it" to the click, longer than the fetch takes, and a touch is followed by the click.
 * Table links use the plain Link (no prefetch at all).
 */
export default function IntentLink({ onMouseEnter, onMouseLeave, onFocus, onTouchStart, ...rest }: ComponentProps<typeof Link>) {
  const [active, setActive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => stop, []);
  return (
    <Link
      {...rest}
      // true is the whole page in two requests (the route, then its payload); Next's default (null) cuts the same page into four. False until the reader shows intent.
      prefetch={active ? true : false}
      onMouseEnter={(e: MouseEvent<HTMLAnchorElement>) => { onMouseEnter?.(e); if (!active && !timer.current) timer.current = setTimeout(() => { timer.current = null; setActive(true); }, INTENT_DWELL_MS); }}
      onMouseLeave={(e: MouseEvent<HTMLAnchorElement>) => { onMouseLeave?.(e); stop(); }}
      onFocus={(e: FocusEvent<HTMLAnchorElement>) => { onFocus?.(e); setActive(true); }}
      onTouchStart={(e: TouchEvent<HTMLAnchorElement>) => { onTouchStart?.(e); setActive(true); }}
    />
  );
}
