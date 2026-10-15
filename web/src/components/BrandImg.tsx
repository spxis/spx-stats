import { BRAND_MARKS, type BrandName } from "@/lib/brandMarks";

/**
 * A SPXIS mark from public/brand as a picture, in its light and dark file (one is hidden by theme, see globals.css; the hidden one is lazy, so it is
 * never fetched). `height` is the drawn height in px; the width follows the mark. Marks are © SportsInteractive, not under the site's data licences.
 */
export function BrandImg({ name, height, alt, lazy = true }: { name: BrandName; height: number; alt: string; lazy?: boolean }) {
  const { w, h } = BRAND_MARKS[name];
  const width = Math.round((height * w) / h);
  const common = { width, height, loading: lazy ? ("lazy" as const) : undefined, decoding: "async" as const };
  const dark = name !== "shield-icon";
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- small own SVGs; next/image would only add a proxy */}
      <img className="bimg bimg-light" src={`/brand/${name}.svg`} alt={alt} {...common} />
      {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
      {dark ? <img className="bimg bimg-dark" src={`/brand/${name}-dark.svg`} alt={alt} {...common} loading="lazy" /> : null}
    </>
  );
}
