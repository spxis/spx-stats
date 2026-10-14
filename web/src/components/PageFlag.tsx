import { FLAG_HEIGHT, FLAG_WIDTH } from "@/lib/flagSvg";
import "./flag.css";

/** The id of a country's flag in the page's own sprite (PageFlagSprite). */
export const pageFlagId = (code: string): string => `pf-${code.toLowerCase()}`;

/**
 * A country's flag in a list that draws it on many rows: a few bytes pointing at the symbol PageFlagSprite wrote into the same page once, in the site's
 * fixed 24x16 box. A code the sprite lacks draws the empty box, and the country's code or name is always beside it. Plain markup, so a client component can use it.
 */
export function PageFlag({ code, name }: { code: string | null | undefined; name?: string }) {
  if (!code) return null;
  return (
    <span className="flag" role={name ? "img" : undefined} aria-label={name} title={name} aria-hidden={name ? undefined : true}>
      <svg width={FLAG_WIDTH} height={FLAG_HEIGHT} aria-hidden="true" focusable="false">
        <use href={`#${pageFlagId(code)}`} width={FLAG_WIDTH} height={FLAG_HEIGHT} />
      </svg>
    </span>
  );
}
