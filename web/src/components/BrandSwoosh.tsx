import { SWOOSH } from "@/lib/brandSwoosh";

/**
 * The SPXIS swoosh, drawn inline (one drawing, light or dark page through the --mk-* tokens at the end of globals.css). A SPXIS mark, © SportsInteractive: not
 * under the site's data licences. Decorative: the wordmark beside it names the site.
 */
export function BrandSwoosh({ height = 24 }: { height?: number }) {
  return (
    <svg className="bm" viewBox={`0 0 ${SWOOSH.w} ${SWOOSH.h}`} width={Math.round((height * SWOOSH.w) / SWOOSH.h)} height={height} aria-hidden="true" focusable="false">
      {SWOOSH.parts.map((p, i) => (
        <path key={i} className={`bm-${p.k}`} d={p.d} strokeWidth={p.stroke ? p.sw : undefined} />
      ))}
    </svg>
  );
}
