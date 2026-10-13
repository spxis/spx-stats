import { sizeFlagSvg, type FlagShape } from "@/lib/flagSvg";
import "./flag.css";

/**
 * The one place a flag is drawn: Hata's SVG (MIT; the drawings are from Wikimedia Commons) in the site's fixed flag box.
 * Plain markup with no server-only code, so a client component can use it; pages use the async Flag instead.
 * Without `name` the flag is decoration (the country is named beside it). `shape` must be the one the svg was loaded for.
 */
export function FlagIcon({ svg, name, label, shape = "rect" }: { svg: string; name?: string; label?: string; shape?: FlagShape }) {
  const a11y = name ? { role: "img", "aria-label": label ?? name, title: name } : { "aria-hidden": true as const };
  return <span className={shape === "rect" ? "flag" : `flag flag-${shape}`} {...a11y} dangerouslySetInnerHTML={{ __html: sizeFlagSvg(svg, shape) }} />;
}
