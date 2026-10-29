import { abbrFor } from "@/lib/abbr";
import type { AbbrMap } from "@/lib/abbr";
import { brandFor, logoFor, type BrandMap } from "@/lib/brand";
import { atUtc } from "@/lib/format";
import { placeOf, type DrawnGame } from "@/lib/gamePlace";
import { drawGameOnce, groundOf, sportOf, type GameDrawing } from "@/lib/gameSurface";
export { placeOf, type DrawnGame };
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { LG, seasonLabel, topLeague } from "@/lib/leagues";
import { leftRight } from "@/lib/sides";
import { seriesLooks } from "@/lib/seriesLooks";
import { groundById } from "@johnmorrisdotca/kyogijo-stadiums";
import { Credits } from "./Credits";
import "./kyogijo.css";
import "./gamesurface.css";

/**
 * One game's score on the surface it was played on (kyogijo, drawn at build or on the first visit and kept with the page, so a view costs no server
 * work): the clubs' colours and logos at the ends, the score in the middle, and for an MLB game the outfield fence of the park it was played in.
 * The drawing is decorative: the figure's label says the score as text and the caption says what is drawn.
 */
export async function GameSurface({ lg, year, game, competition, brands, abbrs, leftF }: {
  lg: string; year: number; game: DrawnGame; competition?: string; brands: BrandMap; abbrs: AbbrMap;
  /** On the page of a series: the franchise that is on the left of the series' banner, which the surface keeps on its left (lib/sides.ts). */
  leftF?: number | null;
}) {
  const sport = sportOf(lg);
  if (!sport || game.home.score == null || game.away.score == null) return null;
  const sp = await currentSpeaker();
  const { say, dt } = sp;
  const { venue, neutral, park } = await placeOf(lg, year, game, brands);
  // The drawing's left and right sides (lib/sides.ts); kyogijo is told the left team as its `away` and the right team as its `home`.
  const { left, right } = leftRight(game.away, game.home, { leftOf: leftF != null ? (t) => t.f === leftF : undefined, sport });
  const [la, lb] = seriesLooks(lg, brandFor(brands, left.f, year), brandFor(brands, right.f, year));
  const extra = say(topLeague(lg) === "mlb" ? "game.extras" : "game.ot");
  const status = game.overtime ? say("scores.finalExtra", { extra }) : say("scores.final");
  const side = (s: DrawnGame["home"], look: typeof la): GameDrawing["home"] => ({
    name: s.name, abbr: abbrFor(abbrs, s.f, year, s.name), score: s.score, color: look.block, ink: look.on, logo: logoFor(brands, s.f, year),
  });
  const drawing = drawGameOnce({
    sport, year, language: sp.locale === "ja" ? "ja" : "en", status, competition, date: dt.full(atUtc(game.date)), park,
    away: side(left, la), home: side(right, lb),
  });
  if (!drawing) return null;
  const league = LG[lg as keyof typeof LG] ?? lg.toUpperCase(), season = seasonLabel(lg, year);
  const caption = neutral ? say("gs.neutral", { league, season })
    : venue && park ? say("gs.park", { venue: venue.name })
      : venue ? say("gs.venue", { venue: venue.name, league, season })
        : say("gs.std", { league, season });
  return (
    <figure className="gsurf" data-sport={sport} aria-label={say("gs.aria", { away: left.name, awayScore: left.score!, home: right.name, homeScore: right.score!, status })}>
      <div className="gsurf-art" style={{ aspectRatio: `${drawing.width} / ${drawing.height}` }} dangerouslySetInnerHTML={{ __html: drawing.svg }} />
      <figcaption className="note">{[competition, dt.full(atUtc(game.date))].filter(Boolean).join(" · ")}<br />{caption} <Credits say={say} use={["surfaces"]} /></figcaption>
    </figure>
  );
}

/** A side of a soccer match on the strip: its name and short code, what it scored, its round flag (an address) and its colours (a hex without #). */
export interface SoccerSide { name: string; abbr: string; goals: number; penalties?: number | null; logo?: string | null; color?: string | null; ink?: string | null }

/** How a soccer match was finished past ninety minutes: extra time, a penalty shoot-out, or MLS's skills shoot-out. */
export type SoccerFinish = "aet" | "pens" | "so";

/** The status kyogijo writes in the strip: its own short words (English and Japanese) for a finish past ninety minutes, the site's "Final" in any other language. */
const finishStatus = (finish: SoccerFinish | null, locale: string, plain: string): string =>
  locale !== "en" && locale !== "ja" ? plain : finish === "pens" ? "final-pens" : finish === "aet" ? "final-aet" : finish === "so" ? "final-so" : "final";

/**
 * A soccer match on its pitch, in kyogijo's pageant look: the ground when the stadium is one kyogijo knows by its Wikidata id (the pitch at its published size), else a
 * standard pitch. Each side's flag lies over its half as a carpet (a national team's own file, /soccer-flag/ES.rect.svg; a club has no picture, its emblem is not ours to
 * draw, so it is a carpet of its banner colours with its name across it), and the strip under the pitch has each side's three-letter code (the FIFA code of a national
 * team, lib/soccerLook.ts), its goals and the way the match finished. `note` is the page's own words for that ("after extra time", "4–2 on penalties"), which the
 * figure's label says; `winner` is given because a shoot-out settles a level score. The options kyogijo gets for soccer are built in one place, soccerOptions in lib/gameSurface.ts.
 */
export async function SoccerSurface({ home, away, note, finish, winner, competition, date, wikidata }: {
  home: SoccerSide; away: SoccerSide;
  note: string | null; finish: SoccerFinish | null; winner: "home" | "away" | "none"; competition?: string; date: string; wikidata?: string | null;
}) {
  const sp = await currentSpeaker();
  const { say } = sp;
  const ground = groundOf(wikidata);
  const status = note ? `${say("scores.final")} · ${note}` : say("scores.final");
  const side = (s: SoccerSide): GameDrawing["home"] => ({ name: s.name, abbr: s.abbr, score: s.goals, penalties: s.penalties, logo: s.logo, color: s.color, ink: s.ink });
  // The home side (FIFA's Team A) on the left and the visitor on the right, soccer's order (lib/sides.ts); kyogijo is told the left team as its `away` and the right team as its `home`.
  const { left, right, swapped } = leftRight(away, home, { winner: winner === "none" ? null : winner, sport: "soccer" });
  const drawing = drawGameOnce({
    sport: "soccer", year: null, language: sp.locale === "ja" ? "ja" : "en", status: finishStatus(finish, sp.locale, say("scores.final")), competition, date, ground,
    winner: winner === "none" ? "none" : (winner === "home") === swapped ? "away" : "home",
    away: side(left), home: side(right),
  });
  if (!drawing) return null;
  const g = ground ? groundById(ground) : null;
  return (
    // The label's wording is "{away} ..., {home} ..." and says the left side first, as the drawing does.
    <figure className="gsurf" data-sport="soccer" aria-label={say("gs.aria", { away: left.name, awayScore: left.goals, home: right.name, homeScore: right.goals, status })}>
      <div className="gsurf-art" style={{ aspectRatio: `${drawing.width} / ${drawing.height}` }} dangerouslySetInnerHTML={{ __html: drawing.svg }} />
      <figcaption className="note">{[competition, date].filter(Boolean).join(" · ")}<br />{g ? say("gs.ground", { venue: g.name }) : say("gs.stdSoccer")} <Credits say={say} use={["surfaces"]} /></figcaption>
    </figure>
  );
}
