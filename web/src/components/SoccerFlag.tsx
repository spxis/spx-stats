import { FLAG_HEIGHT, FLAG_ROUND_HERO, FLAG_ROUND_LARGE, FLAG_SIDE, FLAG_WIDTH } from "@/lib/flagSvg";
import { flagSymbolId, soccerFlagsPath, type SoccerFlagShape } from "@/lib/soccerFlagSprite";
import "./flag.css";

/**
 * A national team's flag on the World Cup pages. A tournament page shows the same few dozen flags hundreds of times (every table, bracket and
 * lineup), and some of Hata's drawings with a coat of arms are over 100 KB (Spain, Mexico, Ecuador), so drawing each one inline would make a page of
 * several megabytes. Instead every flag of a national team is drawn once, in one cached file per shape (/soccer-flags-round.svg and /soccer-flags.svg,
 * lib/soccerFlagFile.ts), and each use here is a few bytes pointing at it. A code the file lacks draws nothing but the empty box, and the team's name
 * is always beside it. `name` is the country's name for screen readers and the tooltip.
 *
 * The World Cup pages draw round flags (Hata's own round frame, in the file), in one of three fixed sizes: 18px in lists and tables, with `large`
 * 56px in the heading of a head-to-head or a team, and with `hero` 72px in the crest circle of a match's banner (components/Showdown.tsx).
 * The kyogijo strip under the pitch takes the same round flags, one file each (app/soccer-flag/[file]). `shape="rect"` is the flag as a flag in the site's usual 24x16 box.
 */
export function SoccerFlag({ code, name, shape = "round", large = false, hero = false }: { code: string | null | undefined; name?: string; shape?: SoccerFlagShape; large?: boolean; hero?: boolean }) {
  if (!code) return null;
  const huge = shape === "round" && hero;
  const big = shape === "round" && large && !hero;
  const w = shape === "rect" ? FLAG_WIDTH : huge ? FLAG_ROUND_HERO : big ? FLAG_ROUND_LARGE : FLAG_SIDE;
  const h = shape === "rect" ? FLAG_HEIGHT : w;
  const cls = shape === "rect" ? "flag" : huge ? "flag flag-round flag-hero" : big ? "flag flag-round flag-lg" : "flag flag-round";
  return (
    <span className={cls} role={name ? "img" : undefined} aria-label={name} title={name} aria-hidden={name ? undefined : true}>
      <svg width={w} height={h} aria-hidden="true" focusable="false">
        <use href={`${soccerFlagsPath(shape)}#${flagSymbolId(code, shape)}`} width={w} height={h} />
      </svg>
    </span>
  );
}
