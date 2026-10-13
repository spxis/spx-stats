"use client";

import { useState, type CSSProperties } from "react";
import "./teamlogo.css";

/** regular keeps the logo's own proportions at a fixed height; square and circle fit it inside a tile of `size`. */
export type LogoShape = "regular" | "square" | "circle";

/** The size of a logo beside a team's name in a list or table. Keep in step with the default in teamlogo.css. */
export const LOGO_SIZE = 20;

/**
 * A team logo, hot-linked from Wikimedia Commons and shown small to identify the team (see the Logos page).
 * A logo that fails to load is dropped rather than left as a broken image. It carries no alt text of its own because the
 * team's name always sits beside it (a screen reader would read the name twice); use TeamLabel for a logo with its name.
 */
export function TeamLogo({ url, size = LOGO_SIZE, shape = "regular" }: { url: string | null | undefined; size?: number; shape?: LogoShape }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote, already-small logos; next/image would proxy a third party's trademarks
    <img className={shape === "regular" ? "logo" : `logo ${shape}`} style={{ "--s": `${size}px` } as CSSProperties} src={url} alt="" width={size} height={size} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  );
}
