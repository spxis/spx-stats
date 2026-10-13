import { FLAG_HEIGHT, FLAG_WIDTH } from "@/lib/flagSvg";
import { SOCCER_FLAGS_PATH, flagSymbolId } from "@/lib/soccerFlagSprite";
import "./flag.css";

/**
 * A national team's flag on the World Cup pages. A tournament page shows the same few dozen flags hundreds of times (every table, bracket and
 * lineup), and some of Hata's drawings with a coat of arms are over 100 KB (Spain, Mexico, Ecuador), so drawing each one inline would make a page of
 * several megabytes. Instead every flag of a national team is drawn once, in one cached file (/soccer-flags.svg, app/soccer-flags.svg/route.ts),
 * and each use here is a few bytes pointing at it. The box is the site's usual flag box (flag.css). `name` is the country's name for screen readers
 * and the tooltip; a code the file lacks draws nothing but the empty box, and the team's name is always beside it.
 */
export function SoccerFlag({ code, name }: { code: string | null | undefined; name?: string }) {
  if (!code) return null;
  return (
    <span className="flag" role={name ? "img" : undefined} aria-label={name} title={name} aria-hidden={name ? undefined : true}>
      <svg width={FLAG_WIDTH} height={FLAG_HEIGHT} aria-hidden="true" focusable="false">
        <use href={`${SOCCER_FLAGS_PATH}#${flagSymbolId(code)}`} width={FLAG_WIDTH} height={FLAG_HEIGHT} />
      </svg>
    </span>
  );
}
