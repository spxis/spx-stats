import type { BigGame } from "@/lib/bigGame";
import { gameCupSvg } from "@/lib/cups";
import type { Speaker } from "@/lib/i18n/i18n";
import { bigGameTrophy } from "@/lib/trophies";
import "./bigbanner.css";

/** Where the series stands after a game, in words: "Rays lead 3–2", "Brewers win 4–1", "Series tied 2–2". The club is named by its nickname. */
export function seriesLine(big: BigGame, say: Speaker["say"]): string | null {
  const s = big.series;
  if (!s) return null;
  if (s.kind === "tied" || !s.lead) return say("big.tied", { a: s.a, b: s.b });
  return say(s.kind === "wins" ? "big.wins" : "big.leads", { team: s.lead.name, a: s.a, b: s.b });
}

/**
 * The banner across the top of a postseason game: the round's name, the game's number in its series (or the Playoff round of a college game), and, when given,
 * where the series stands. The league's last round is the strongest look (`final`), every other round a quieter one; both take the page's accent and the
 * site's tokens, so they read in light and dark. The last round also carries the league's title trophy when the package has a cup for it (lib/trophies.ts,
 * drawn on the server by lib/cups.ts): small on a score card, large on the game page, and stronger still on the game that decides the title.
 */
export function BigBanner({ big, say, lg, year, state, page = false }: { big: BigGame; say: Speaker["say"]; lg: string; year: number; state?: string | null; page?: boolean }) {
  const phrase = big.final ? bigGameTrophy(lg, year) : null;
  const trophy = phrase ? say(phrase) : null;
  return (
    <div className={"bigbar" + (big.final ? " final" : "") + (page ? " ongame" : "") + (trophy ? " withcup" : "") + (trophy && big.decides ? " decides" : "")}>
      {trophy ? <span className="bigtrophy" role="img" aria-label={trophy} title={trophy} dangerouslySetInnerHTML={{ __html: gameCupSvg(lg, page) }} /> : null}
      <div className="bigtext">
        <b className="bigname">{big.round}</b>
        {big.n != null ? <span className="biggame">{say("gm.gameN", { n: big.n })}</span> : null}
        {big.tag ? <span className="biggame">{big.tag}</span> : null}
        {state ? <span className="bigstate">{state}</span> : null}
        {trophy && page ? <span className="bigcaption">{big.decides ? say("big.decider", { trophy }) : trophy}</span> : null}
      </div>
    </div>
  );
}
