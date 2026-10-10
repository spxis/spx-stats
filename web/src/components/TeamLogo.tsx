"use client";

import { useState } from "react";

/**
 * A team logo, hot-linked from Wikimedia Commons and shown small to identify the team (see the Logos page).
 * A logo that fails to load is dropped rather than left as a broken image.
 */
export function TeamLogo({ url, size = 20 }: { url: string | null | undefined; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote, already-small logos; next/image would proxy a third party's trademarks
    <img className="logo" src={url} alt="" width={size} height={size} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  );
}
