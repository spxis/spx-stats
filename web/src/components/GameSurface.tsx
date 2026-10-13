import { abbrFor } from "@/lib/abbr";
import type { AbbrMap } from "@/lib/abbr";
import { brandFor, logoFor, type BrandMap } from "@/lib/brand";
import { atUtc } from "@/lib/format";
import { drawGameOnce, groundOf, homeVenueIn, neutralSite, parkFits, parkOf, sportOf, type GameDrawing, type HomeVenue } from "@/lib/gameSurface";
import { getGameVenue } from "@/lib/gameVenue";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { LG, seasonLabel } from "@/lib/leagues";
import { seriesLooks } from "@/lib/seriesLooks";
import { getVenueFacts, getVenueNames, nameIn } from "@/lib/venueName";
import { getVenuePlaces, placeKey } from "@/lib/venuePlace";
import { groundById } from "@johnmorrisdotca/kyogijo";
import { Credits } from "./Credits";
import "./kyogijo.css";
import "./gamesurface.css";

/** The game a drawing is made from: both clubs by franchise (for their colours, logos and, failing api.game_venue, home venue) and what each scored. */
export interface DrawnGame {
  /** The game's id in the archive: api.game_venue says where it was played. */
  id: number;
  date: string;
  phase: string;
  /** The league's last game of the season (a series' last game in the final). */
  final?: boolean;
  home: { f: number | null; name: string; score: number | null };
  away: { f: number | null; name: string; score: number | null };
  overtime: boolean;
}

/**
 * Where a game was played, and whether to say so. api.game_venue (data release 2026.10.13-20) names the venue of every game it knows: the home club's
 * (basis `home`) or the one a source gives (a Super Bowl, a Grey Cup, a 2020 World Series). A game it places nowhere gets the standard surface with no
 * venue named, and so does a `home` game of a bubble season (the 2019-20 NHL and NBA playoffs were played in hubs). When api.game_venue or api.venue_ref
 * (migration 082) cannot be read, the venue is the home club's of that season from the brand eras, as before the release, and a neutral-site final gets
 * the standard surface.
 */
async function whereOf(lg: string, year: number, game: DrawnGame, brands: BrandMap): Promise<{ venue: HomeVenue | null; neutral: boolean }> {
  const gv = await getGameVenue(game.id);
  const names = await getVenueNames();
  if (gv?.wid) {
    if (gv.basis === "home" && neutralSite(lg, year, game.phase, !!game.final)) return { venue: null, neutral: true };
    return { venue: { name: nameIn(names.get(gv.wid), year, gv.name ?? ""), wid: gv.wid, current: false }, neutral: false };
  }
  if (gv && (gv.venueId == null || gv.basis !== "home")) return { venue: null, neutral: false };
  if (neutralSite(lg, year, game.phase, !!game.final)) return { venue: null, neutral: true };
  const [places, facts] = await Promise.all([getVenuePlaces(lg), getVenueFacts()]);
  const venue = homeVenueIn(brands, game.home.f, game.date, year, {
    place: (f, v, lat, lon) => { const p = places.get(placeKey(f, v, lat, lon) ?? ""); return p ? { wid: p.wid, city: p.city } : null; },
    span: (wid) => { const x = facts.get(wid); return x ? { opened: x.opened, closed: x.closed } : null; },
    nameIn: (wid, y, fallback) => nameIn(names.get(wid), y, fallback),
  });
  return { venue, neutral: false };
}

/**
 * One game's score on the surface it was played on (kyogijo, drawn at build or on the first visit and kept with the page, so a view costs no server
 * work): the clubs' colours and logos at the ends, the score in the middle, and for an MLB game the outfield fence of the park it was played in.
 * The drawing is decorative: the figure's label says the score as text and the caption says what is drawn.
 */
export async function GameSurface({ lg, year, game, competition, brands, abbrs }: { lg: string; year: number; game: DrawnGame; competition?: string; brands: BrandMap; abbrs: AbbrMap; }) {
  const sport = sportOf(lg);
  if (!sport || game.home.score == null || game.away.score == null) return null;
  const sp = await currentSpeaker();
  const { say, dt } = sp;
  const where = await whereOf(lg, year, game, brands);
  const neutral = where.neutral;
  let venue = where.venue;
  let park = sport === "mlb" ? parkOf(venue) : null;
  // A park kyogijo knows to have stood in other years is not the park of this season, so nothing is claimed about the venue.
  if (park && !parkFits(park, year)) { park = null; venue = null; }
  const [la, lb] = seriesLooks(lg, brandFor(brands, game.away.f, year), brandFor(brands, game.home.f, year));
  const extra = say(lg === "mlb" ? "game.extras" : "game.ot");
  const status = game.overtime ? say("scores.finalExtra", { extra }) : say("scores.final");
  const side = (s: DrawnGame["home"], look: typeof la): GameDrawing["home"] => ({
    name: s.name, abbr: abbrFor(abbrs, s.f, year, s.name), score: s.score, color: look.block, ink: look.on, logo: logoFor(brands, s.f, year),
  });
  const drawing = drawGameOnce({
    sport, year, language: sp.locale === "ja" ? "ja" : "en", status, competition, date: dt.full(atUtc(game.date)), park,
    away: side(game.away, la), home: side(game.home, lb),
  });
  if (!drawing) return null;
  const league = LG[lg as keyof typeof LG] ?? lg.toUpperCase(), season = seasonLabel(lg, year);
  const caption = neutral ? say("gs.neutral", { league, season })
    : venue && park ? say("gs.park", { venue: venue.name })
      : venue ? say("gs.venue", { venue: venue.name, league, season })
        : say("gs.std", { league, season });
  return (
    <figure className="gsurf" data-sport={sport} aria-label={say("gs.aria", { away: game.away.name, awayScore: game.away.score, home: game.home.name, homeScore: game.home.score, status })}>
      <div className="gsurf-art" style={{ aspectRatio: `${drawing.width} / ${drawing.height}` }} dangerouslySetInnerHTML={{ __html: drawing.svg }} />
      <figcaption className="note">{[competition, dt.full(atUtc(game.date))].filter(Boolean).join(" · ")}<br />{caption} <Credits say={say} use={["surfaces"]} /></figcaption>
    </figure>
  );
}

/**
 * A soccer match on its pitch: the ground when the stadium is one kyogijo knows by its Wikidata id (the pitch at its published size), else a standard pitch.
 * No crests (a team's emblem is not ours to draw): the two sides keep kyogijo's own colours. `note` is what follows "Final" ("after extra time", "4–2 on
 * penalties"), written in the status; `winner` is given because a shoot-out settles a level score.
 */
export async function SoccerSurface({ home, away, note, winner, competition, date, wikidata }: {
  home: { name: string; goals: number }; away: { name: string; goals: number };
  note: string | null; winner: "home" | "away" | "none"; competition?: string; date: string; wikidata?: string | null;
}) {
  const sp = await currentSpeaker();
  const { say } = sp;
  const ground = groundOf(wikidata);
  const status = note ? `${say("scores.final")} · ${note}` : say("scores.final");
  const drawing = drawGameOnce({
    sport: "soccer", year: null, language: sp.locale === "ja" ? "ja" : "en", status, competition, date, ground, winner,
    away: { name: away.name, score: away.goals }, home: { name: home.name, score: home.goals },
  });
  if (!drawing) return null;
  const g = ground ? groundById(ground) : null;
  return (
    <figure className="gsurf" data-sport="soccer" aria-label={say("gs.aria", { away: away.name, awayScore: away.goals, home: home.name, homeScore: home.goals, status })}>
      <div className="gsurf-art" style={{ aspectRatio: `${drawing.width} / ${drawing.height}` }} dangerouslySetInnerHTML={{ __html: drawing.svg }} />
      <figcaption className="note">{[competition, date].filter(Boolean).join(" · ")}<br />{g ? say("gs.ground", { venue: g.name }) : say("gs.stdSoccer")} <Credits say={say} use={["surfaces"]} /></figcaption>
    </figure>
  );
}
