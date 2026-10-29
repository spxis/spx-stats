import type { BigGame } from "@/lib/bigGame";
import type { Speaker } from "@/lib/i18n/i18n";
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
 * site's tokens, so they read in light and dark.
 */
export function BigBanner({ big, say, state, page = false }: { big: BigGame; say: Speaker["say"]; state?: string | null; page?: boolean }) {
  return (
    <div className={"bigbar" + (big.final ? " final" : "") + (page ? " ongame" : "")}>
      <b className="bigname">{big.round}</b>
      {big.n != null ? <span className="biggame">{say("gm.gameN", { n: big.n })}</span> : null}
      {big.tag ? <span className="biggame">{big.tag}</span> : null}
      {state ? <span className="bigstate">{state}</span> : null}
    </div>
  );
}
