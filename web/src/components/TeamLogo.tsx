"use client";

import { useState, type CSSProperties } from "react";
import { useLogoFit } from "@/components/LogoFitProvider";
import { fitsTile, INLINE_MAX, tileColour, type Fit } from "@/lib/logoFit";
import "./teamlogo.css";

/** regular keeps the logo's own proportions at a fixed height; square and circle fit it inside a tile of `size`. */
export type LogoShape = "regular" | "square" | "circle";

/** The size of a logo beside a team's name in a list or table. Keep in step with the default in teamlogo.css. */
export const LOGO_SIZE = 20;

/**
 * A team logo, hot-linked from Wikimedia Commons and shown small to identify the team (see the Logos page).
 * A logo that fails to load is dropped rather than left as a broken image. It carries no alt text of its own because the
 * team's name always sits beside it (a screen reader would read the name twice); use TeamLabel for a logo with its name.
 * `dim` draws a logo that stands in for the real one (the current mark beside a past name), with `title` saying so.
 *
 * A logo at the table size (up to 28 px, the default) is drawn in one standard box, 20 px high and between 20 and 36 px wide, so a wordmark
 * cannot widen a row. Where a logo has an approved fit (lib/logoFit.ts) its primary mark replaces it in that box and in circles and squares,
 * and the picture is scaled and nudged inside its tile. `fit` overrides that lookup (/admin/logos draws proposed fits; null draws none).
 */
export function TeamLogo({ url, size = LOGO_SIZE, shape = "regular", dim = false, title, fit }: { url: string | null | undefined; size?: number; shape?: LogoShape; dim?: boolean; title?: string; fit?: Fit | null }) {
  const approved = useLogoFit(url);
  const [failed, setFailed] = useState(false);
  const [markFailed, setMarkFailed] = useState(false);
  if (!url || failed) return null;
  const chosen = fit === undefined ? approved : fit;
  const inline = shape === "regular" && size <= INLINE_MAX;
  const mark = chosen?.mark && !markFailed && (shape !== "regular" || inline) ? chosen.mark : null;
  const src = mark ?? url;
  const onError = () => (mark ? setMarkFailed(true) : setFailed(true));
  const vars = { "--s": `${size}px`, "--wmax": inline ? 1.8 : 2.4 } as CSSProperties;
  // A dark logo (fit tile "light") gets a light chip behind it on dark pages, where it would otherwise vanish beside the team's name.
  const chip = shape === "regular" && inline && chosen?.bg === "light";
  const cls = `${shape === "regular" ? "logo" : `logo ${shape}`}${dim ? " dim" : ""}${chip ? " chip" : ""}`;
  if (shape !== "regular" && chosen && fitsTile(chosen)) {
    const tile = tileColour(chosen.bg);
    return (
      <span className={`${cls} fit`} title={title} style={tile ? { ...vars, background: tile } : vars}>
        {/* eslint-disable-next-line @next/next/no-img-element -- remote, already-small logos; next/image would proxy a third party's trademarks */}
        <img style={{ transform: `translate(${chosen.dx}%, ${chosen.dy}%) scale(${chosen.scale})` }} src={src} alt="" width={size} height={size} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={onError} />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote, already-small logos; next/image would proxy a third party's trademarks
    <img className={cls} title={title} style={vars} src={src} alt="" width={size} height={size} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={onError} />
  );
}
