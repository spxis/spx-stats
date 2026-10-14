import type { ReactNode } from "react";
import "./showdown.css";

/** One side of the banner. Everything is already words and links in the reader's language; the banner only lays them out. */
export interface ShowdownSide {
  /** The mark in the circle: a team logo, a round flag (`<span className="crest flagcrest">`) or a monogram (`<span className="crest"><span className="mono">`). */
  crest: ReactNode;
  /** The team's name: the heading's content, already linked where it goes somewhere. */
  name: ReactNode;
  /** The badge under the name of the side that won ("Champions", "Won"), or nothing. */
  tag?: ReactNode;
  /** Lines under the badge: the side's record, its place. */
  meta?: ReactNode[];
  /** Links along the foot of the side. */
  links?: ReactNode[];
  /** The side that lost a game that was settled: drawn paler. */
  lost?: boolean;
}

/**
 * The showdown banner of a playoff series and a soccer match: the two teams as blocks in their own colours cut on the diagonal, the crest and name on each,
 * and the score between them with a verdict line and notes under it. The colours are page variables set by SeriesStyle (lib/seriesLooks.ts decides them);
 * the layout is showdown.css, with its phone layout. `winner` is the side (0 or 1) whose number is drawn at full strength; `level` draws both so (a draw).
 */
export function Showdown({ label, a, b, score, scoreLabel, winner, level = false, verdict, notes = [] }: {
  label: string; a: ShowdownSide; b: ShowdownSide;
  score: [ReactNode, ReactNode]; scoreLabel: string; winner: 0 | 1 | null; level?: boolean;
  verdict: ReactNode; notes?: ReactNode[];
}) {
  const side = (s: ShowdownSide, k: "a" | "b") => (
    <div className={`sdside ${k}${s.lost ? " lost" : ""}`}>
      {s.crest}
      <h2 className="sdname">{s.name}</h2>
      {s.tag ? <span className="wintag">{s.tag}</span> : null}
      {s.meta?.map((m, i) => <span key={i} className="sdmeta">{m}</span>)}
      {s.links?.length ? <span className="sdlinks">{s.links}</span> : null}
    </div>
  );
  return (
    <section className="showdown" aria-label={label}>
      {side(a, "a")}
      <div className="sdmid">
        <div className={level ? "bigscore level" : "bigscore"} aria-label={scoreLabel}>
          <b className={`n a${winner === 0 ? " w" : ""}`}>{score[0]}</b>
          <span className="dash" aria-hidden="true">–</span>
          <b className={`n b${winner === 1 ? " w" : ""}`}>{score[1]}</b>
        </div>
        <span className="verdict">{verdict}</span>
        {notes.map((n, i) => <span key={i} className="sdnote">{n}</span>)}
      </div>
      {side(b, "b")}
    </section>
  );
}
