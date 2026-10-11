import Link from "next/link";
import type { getBrands } from "@/lib/data";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { sayFor, type Say } from "@/lib/seriesCopy";
import { logoFor } from "@/lib/brand";
import type { Bracket, Box } from "@/lib/bracket";
import { loadPlayoffs } from "@/lib/playoffs";
import { nickname, roundPath, scoreWords, seriesPath, type Series } from "@/lib/series";
import { TeamLogo } from "./TeamLogo";
import "./series.css";

/** One series as a card: both teams, the winner in bold, the score; the card opens the series page. */
export function SeriesCard({ lg, s, brands, year, say }: { lg: string; s: Series; brands: Awaited<ReturnType<typeof getBrands>>; year: number; say: Say }) {
  const single = s.games.length === 1 && s.games[0].score[0] != null;
  const goals = s.basis === "goals";
  const num = (i: 0 | 1) => (single ? s.games[0].score[i] : goals ? s.sides[i].scored : s.sides[i].wins);
  return (
    <Link href={seriesPath(lg, year, s)} prefetch={false} className="sercard" title={say("card.title", { a: s.sides[0].name, b: s.sides[1].name })}>
      {([0, 1] as const).map((i) => (
        <span key={i} className={`serrow${s.winner === i ? " won" : ""}`}>
          <TeamLogo url={logoFor(brands, s.sides[i].f, year)} size={18} />
          <span className="nm">{s.sides[i].name}</span>
          <b>{num(i)}</b>
        </span>
      ))}
      <span className="sermeta">{goals ? say("card.totalScore") : single ? say("card.oneGame") : say("card.games", { count: s.games.length })}{s.winner == null ? say("card.notSettled") : ""}</span>
    </Link>
  );
}

type Brands = Awaited<ReturnType<typeof getBrands>>;

/** One series as a compact box: the two clubs (the winner in bold), nothing else; the box opens the series page. */
function BracketBox({ lg, year, s, brands, say, pos, top }: { lg: string; year: number; s: Series; brands: Brands; say: Say; pos: { y: number; to: number | null; fed: boolean; last?: boolean; final?: boolean }; top?: 0 | 1 }) {
  const dy = pos.to == null ? 0 : pos.to - pos.y;
  const order = top === 1 ? ([1, 0] as const) : ([0, 1] as const);
  const title = s.winner == null ? say("card.title", { a: s.sides[0].name, b: s.sides[1].name }) : `${s.sides[0].name} ${scoreWords(s, say)} ${s.sides[1].name}`;
  return (
    <Link
      href={seriesPath(lg, year, s)} prefetch={false} title={title}
      className={`bx${pos.fed ? " fed" : ""}${pos.to != null ? (dy < 0 ? " out up" : " out") : ""}${pos.last ? " last" : ""}${pos.final ? " final" : ""}`}
      style={{ top: `calc(var(--row) * ${pos.y} + 5px)`, "--dy": Math.abs(dy) } as React.CSSProperties}
    >
      {order.map((i) => (
        <span key={i} className={`bxr${s.winner === i ? " won" : ""}`}>
          <TeamLogo url={logoFor(brands, s.sides[i].f, year)} size={16} />
          <span className="nm">{nickname(s.sides[i].name)}</span>
        </span>
      ))}
    </Link>
  );
}

/** The playoff bracket of a season: one half down each side (the conferences where the alignment data splits them), the final in the middle. Draws nothing when there are no playoff games. */
export async function SeasonPlayoffs({ lg, year }: { lg: string; year: number }) {
  const sp = await currentSpeaker();
  const say = sayFor(sp);
  const { series, names, bracket, brands } = await loadPlayoffs(lg, year, say);
  if (!series.length) return null;
  const rounds = names.length;
  const b: Bracket = bracket;
  const fin = b.final ? series[b.final.i] : null;
  const labelled = b.sides.some((s) => s.label);
  const heading = (r: number, name: string) => <h4><Link href={roundPath(lg, year, r)} prefetch={false} title={sp.say("playoffs.round.title", { round: name })}>{name}</Link></h4>;
  const extra = b.other;
  const left = b.sides.find((s) => s.key === "l"), right = b.sides.find((s) => s.key === "r");
  const sideEl = (side: Bracket["sides"][number]) => (
    <div key={side.key} className={`bkside ${side.key}`} style={{ "--n": b.columns.length } as React.CSSProperties}>
      {labelled ? <h3 className="bkconf">{side.label ?? "\u00a0"}</h3> : null}
      <div className="bkcols">
        {b.columns.map((r) => (
          <div key={r} className="bkcol">
            {heading(r, names[r - 1])}
            <div className="bkarea" style={{ height: `calc(var(--row) * ${b.rows})` }}>
              {side.boxes.filter((x: Box) => x.round === r).map((x: Box) => (
                <BracketBox key={x.i} lg={lg} year={year} s={series[x.i]} brands={brands} say={say} pos={{ y: x.y, to: x.to, fed: x.fed, last: r === b.columns.at(-1) }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <section className="section" id="playoffs">
      <h2>{say("bracket.title")}</h2>
      <p className="note">{sp.say("playoffs.note", { count: sp.fmt(series.length) })}</p>
      {b.robin.length ? <p className="note"><Link href={roundPath(lg, year, 0)} prefetch={false}>{sp.say("playoffs.robinLink", { count: sp.fmt(b.robin.length) })}</Link></p> : null}
      <div className="bkwrap">
        <div className={`bk${fin ? "" : " solo"}`} style={{ "--row": "56px", "--n": b.columns.length } as React.CSSProperties}>
          {left ? sideEl(left) : null}
          {fin && b.final ? (
            <div className="bkside bkfinal">
              {labelled ? <h3 className="bkconf" aria-hidden="true">{"\u00a0"}</h3> : null}
              <div className="bkcols">
                <div className="bkcol">
                  {heading(rounds, names[rounds - 1])}
                  <div className="bkarea" style={{ height: `calc(var(--row) * ${b.rows})` }}>
                    <BracketBox lg={lg} year={year} s={fin} brands={brands} say={say} pos={{ y: b.final.y, to: null, fed: b.sides.length > 0, final: true }} top={b.final.order[0] === 1 ? 1 : 0} />
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          {right ? sideEl(right) : null}
        </div>
      </div>
      {extra.length ? (
        <>
          <h3>{sp.say("playoffs.other")}</h3>
          <div className="bracket mine">
            {extra.map((i) => <SeriesCard key={`${series[i].sides[0].f}-${series[i].sides[1].f}-${series[i].meeting}`} lg={lg} s={series[i]} brands={brands} year={year} say={say} />)}
          </div>
        </>
      ) : null}
    </section>
  );
}
