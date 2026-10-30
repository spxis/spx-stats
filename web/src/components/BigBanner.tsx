import type { BigGame } from "@/lib/bigGame";
import { gameCupSvg } from "@/lib/cups";
import type { Speaker } from "@/lib/i18n/i18n";
import { bigGameTrophy, conferenceTrophyPhrase } from "@/lib/trophies";
import { conferenceTrophyKey, titleTrophyKey } from "@/lib/trophyEra";
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
 * drawn on the server by lib/cups.ts): small on a score card, large on the game page, and stronger still on the game that decides the title. The trophy is the one the
 * league gave that season (lib/trophyEra.ts: the NBA's Larry O'Brien Trophy in its two designs and none before 1977-78, the Vince Lombardi Trophy from 1970, the Commissioner's Trophy from 1967 in the design of 2000 on, the Stanley Cup, the Grey Cup). A conference final (the NBA's, the NFL's, the NHL's) is not the
 * league's last round, so it keeps the quieter look and carries its conference trophy, smaller, with that trophy's own name and no deciding-game treatment.
 */
export function BigBanner({ big, say, lg, year, state, page = false }: { big: BigGame; say: Speaker["say"]; lg: string; year: number; state?: string | null; page?: boolean }) {
  const confKey = !big.final && big.conf ? conferenceTrophyKey(lg, year, big.conf.side) : null;
  const key = big.final ? titleTrophyKey(lg, year) : confKey;
  const phrase = big.final ? bigGameTrophy(lg, year) : confKey ? conferenceTrophyPhrase(lg, year, big.conf?.side) : null;
  const trophy = phrase && key ? say(phrase) : null;
  return (
    <div className={"bigbar" + (big.final ? " final" : "") + (page ? " ongame" : "") + (trophy ? " withcup" : "") + (trophy && confKey ? " conf" : "") + (trophy && big.decides ? " decides" : "")}>
      {trophy && key ? <span className="bigtrophy" role="img" aria-label={trophy} title={trophy} dangerouslySetInnerHTML={{ __html: gameCupSvg(key, page) }} /> : null}
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
