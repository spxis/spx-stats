"use client";

import { flagAddress, flagBox, type FlagShape } from "@/lib/flagSvg";
import "./flag.css";

/**
 * The one place a flag is drawn: Hata's SVG (MIT; the drawings are from Wikimedia Commons) in the site's fixed flag box.
 * The page carries only the address of the flag's own file (app/flag/[file], kept and cached by the browser), never the drawing: some of
 * Hata's drawings are over 100 KB and a page used to hold each one in its markup and again in its payload. No server-only code, so a
 * client component can use it (and it is one, so a page that draws a hundred flags carries a short reference to it for each, not the markup again); pages use the async Flag, which also checks that Hata has the flag.
 * Without `name` the flag is decoration (the country is named beside it). A code Hata has no flag for must not reach here (flagCodes() in lib/flagCodes.ts).
 */
export function FlagIcon({ code, name, label, shape = "rect" }: { code: string; name?: string; label?: string; shape?: FlagShape }) {
  const a11y = name ? { role: "img", "aria-label": label ?? name, title: name } : { "aria-hidden": true as const };
  const { width, height } = flagBox(shape);
  return (
    <span className={shape === "rect" ? "flag" : `flag flag-${shape}`} {...a11y}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a small SVG file, not a photo: next/image has nothing to resize */}
      <img src={flagAddress(code, shape)} width={width} height={height} alt="" loading="lazy" decoding="async" draggable={false} />
    </span>
  );
}
