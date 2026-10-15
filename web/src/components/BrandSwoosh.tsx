import type { CSSProperties } from "react";
import { SWOOSH } from "@/lib/brandSwoosh";
import type { LeagueCode } from "@/lib/leagues";

export type SwooshSport = LeagueCode | "soccer";

/**
 * The SPXIS swoosh, drawn inline (one drawing, light or dark page through the --mk-* tokens at the end of globals.css). A SPXIS mark, © SportsInteractive: not
 * under the site's data licences. Decorative: the wordmark beside it names the site. `sport` fixes the centre to that sport's colour (About shows all of
 * them); without it the centre follows the page (red, or the colour of the sport whose pages these are: components/SportMark.tsx).
 */
export function BrandSwoosh({ height = 24, sport }: { height?: number; sport?: SwooshSport }) {
  return (
    <svg
      className="bm"
      viewBox={`0 0 ${SWOOSH.w} ${SWOOSH.h}`}
      width={Math.round((height * SWOOSH.w) / SWOOSH.h)}
      height={height}
      aria-hidden="true"
      focusable="false"
      style={sport ? ({ "--mk-r": `var(--${sport})` } as CSSProperties) : undefined}
    >
      {SWOOSH.parts.map((p, i) => (
        <path key={i} className={`bm-${p.k}`} d={p.d} strokeWidth={p.stroke ? p.sw : undefined} />
      ))}
    </svg>
  );
}
