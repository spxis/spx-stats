import { RoadArt } from "@/components/RoadArt";
import type { GameRow } from "@/lib/api/types";
import { brandFor, type BrandMap } from "@/lib/brand";
import { BALL_KINDS, driveKindsIn, driveScores, tallyBalls } from "@/lib/fieldPlays";
import { drawMlbBalls, drawNflDrives } from "@/lib/fieldPlaysFile";
import type { FieldRow } from "@/lib/gameField";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { seasonLabel } from "@/lib/leagues";
import { seriesLooks } from "@/lib/seriesLooks";
import { Rich } from "./i18n/Rich";
import "./fieldplays.css";
import "./kyogijo.css";

/** The latest MLB season Retrosheet's event files cover (db/migrations/071): a later season has no hit locations yet, and the page says so. */
export const RETROSHEET_THROUGH = 2025;
/** The first season with hit locations (1986; partial before 1989) and the first with nflverse's play-by-play. */
const MLB_FROM = 1986, NFL_FROM = 1999;

/** The marks of the key as small shapes; the shapes are drawn by the stylesheet. */
const DOT_SHAPE: Record<string, string> = { single: "circle", double: "diamond", triple: "triangle", "home run": "star", reached: "square", out: "circle" };

/**
 * A finished MLB or NFL game's plays drawn on its own field: an MLB game's batted balls, each in the zone Retrosheet gave it, on the park it was played in
 * (kyogijo), and an NFL game's drives, each a bar from where it started to where it ended on the football field, with the plays and how it ended. The drawing is a file
 * (app/field-plays) the page loads when it comes into view, so the page holds a box of its shape and the key and the sums, not the drawing; the same box keeps
 * its place before the file arrives. A game with no plays on record says why in a line instead of drawing an empty field (Retrosheet has not published the season,
 * or has nothing for the game); a season the source never covers leaves the section out. `row` is undefined when the read failed (the section is left out, and the
 * page is redrawn within seconds).
 */
export async function FieldPlays({ lg, game, brands, park, row }: { lg: string; game: GameRow; brands: BrandMap; park: string | null; row: FieldRow | null | undefined }) {
  const mlb = lg === "mlb", nfl = lg === "nfl";
  if ((!mlb && !nfl) || row === undefined) return null;
  const y = game.year;
  if (!row && (mlb ? y < MLB_FROM : y < NFL_FROM)) return null;
  const sp = await currentSpeaker();
  const { say, fmt, locale } = sp;
  const head = say(mlb ? "fp.mlbHead" : "fp.nflHead");
  if (!row) {
    return (
      <section className="section fplay-none">
        <h2>{head}</h2>
        <p className="note">{mlb ? say(y > RETROSHEET_THROUGH ? "fp.mlbNotPublished" : "fp.mlbNone", { season: seasonLabel(lg, y) }) : say("fp.nflNone")}</p>
      </section>
    );
  }
  const away = game.away ?? "—", home = game.home ?? "—";
  const [la, lb] = seriesLooks(lg, brandFor(brands, game.away_f, y), brandFor(brands, game.home_f, y));
  const swatch = (i: 0 | 1) => ({ "--tc": i === 0 ? `#${la.block}` : `#${lb.block}` }) as React.CSSProperties;

  if (mlb) {
    const d = await drawMlbBalls(row, game, brands, sp, park, false);
    const tally = tallyBalls(d.balls);
    const line = (i: 0 | 1, name: string) => {
      const t = tally[i === 0 ? "0" : "1"];
      return say("fp.mlbTeam", { team: name, hits: fmt((t.single ?? 0) + (t.double ?? 0) + (t.triple ?? 0) + (t["home run"] ?? 0)), hr: fmt(t["home run"] ?? 0), outs: fmt(t.out ?? 0) });
    };
    return (
      <section className="section">
        <h2>{head}</h2>
        <p className="note">{say("fp.mlbLede")}</p>
        <figure className="fplay" data-sport="mlb">
          <ul className="fplay-key" aria-label={say("fp.keyAria")}>
            {BALL_KINDS.map((k) => <li key={k.outcome}><i className="fk" data-shape={DOT_SHAPE[k.outcome]} style={{ "--fk": k.color } as React.CSSProperties} aria-hidden="true" />{say(k.phrase)}</li>)}
          </ul>
          <ul className="fplay-teams">
            {([[0, away], [1, home]] as const).map(([i, name]) => <li key={i} style={swatch(i)}><i className="ft" aria-hidden="true" />{line(i, name)}</li>)}
          </ul>
          <RoadArt className="fplay-art" src={`/field-plays/mlb-${game.game_id}.${park ?? "std"}.${locale}.svg`} ratio={d.width / d.height} />
          <noscript><p className="note"><a href={`/field-plays/mlb-${game.game_id}.${park ?? "std"}.${locale}.svg`}>{say("fp.fileLink")}</a></p></noscript>
          <figcaption>
            <p className="note">{say("fp.mlbNote")}{y < 1989 ? ` ${say("fp.mlbPartial")}` : ""}{" "}<Rich text={say("fp.mlbCredit")} parts={{ retrosheet: <a href="https://www.retrosheet.org" target="_blank" rel="noopener noreferrer">Retrosheet</a> }} /></p>
          </figcaption>
        </figure>
      </section>
    );
  }

  const wide = await drawNflDrives(row, game, brands, sp, "wide");
  const phone = await drawNflDrives(row, game, brands, sp, "phone");
  const src = (part: "wide" | "phone") => `/field-plays/nfl-${game.game_id}.${part}.${locale}.svg`;
  const line = (i: 0 | 1, name: string) => say("fp.nflTeam", { team: name, drives: fmt(wide.drives.filter((x) => x.side === i).length), scores: fmt(driveScores(wide.drives, i)) });
  return (
    <section className="section">
      <h2>{head}</h2>
      <p className="note">{say("fp.nflLede")}</p>
      <figure className="fplay" data-sport="nfl">
        <ul className="fplay-key" aria-label={say("fp.keyAria")}>
          {driveKindsIn(wide.drives).map((k) => <li key={k.result}><i className="fg" data-shape={k.shape} data-hollow={k.result === "M" || k.result === "P" || k.result === "H" ? "1" : undefined} aria-hidden="true" />{say(k.phrase)}</li>)}
        </ul>
        <ul className="fplay-teams">
          {([[0, away], [1, home]] as const).map(([i, name]) => <li key={i} style={swatch(i)}><i className="ft" aria-hidden="true" />{line(i, name)}</li>)}
        </ul>
        <div className="fplay-wide"><RoadArt className="fplay-art" src={src("wide")} ratio={wide.width / wide.height} /></div>
        <div className="fplay-phone"><RoadArt className="fplay-art" src={src("phone")} ratio={phone.width / phone.height} /></div>
        <noscript><p className="note"><a href={src("wide")}>{say("fp.fileLink")}</a></p></noscript>
        <figcaption>
          <p className="note">{say("fp.nflNote", { away, home })}{" "}<Rich text={say("fp.nflCredit")} parts={{ nflverse: <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noopener noreferrer">nflverse</a> }} /></p>
        </figcaption>
      </figure>
    </section>
  );
}
