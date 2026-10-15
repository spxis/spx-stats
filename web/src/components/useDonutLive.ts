"use client";

import { useState } from "react";

/**
 * Which slice of one donut the pointer or the keyboard focus is on, so the donut can write that slice's figures in its middle. `bind(key)` gives the
 * handlers for one slice; they do not stop the slice's own handlers (a tooltip, a link), they sit beside them.
 */
export function useDonutLive() {
  const [key, setKey] = useState<string | null>(null);
  const bind = (k: string) => ({
    onPointerEnter: () => setKey(k),
    onPointerLeave: () => setKey((c) => (c === k ? null : c)),
    onFocus: () => setKey(k),
    onBlur: () => setKey((c) => (c === k ? null : c)),
  });
  return { key, bind };
}
