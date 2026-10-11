import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { AccentStyle } from "@/components/AccentStyle";
import { SeriesCard } from "@/components/SeasonPlayoffs";
import { SeriesCharts, type ChartWords } from "@/components/SeriesCharts";
import { SeriesStyle } from "@/components/SeriesStyle";
import { SortTable } from "@/components/SortTable";
import { TeamLogo } from "@/components/TeamLogo";
import { BadgeCup } from "@/components/TrophyIcon";
import { Badge } from "@/components/ui";
import type { GameRow, StandingRow } from "@/lib/api/types";
import { brandFor, logoFor } from "@/lib/brand";
import { titleHolders } from "@/lib/champions";
import { getAbbrs, getBrands, getSummary } from "@/lib/data";
import { abbrFor } from "@/lib/abbr";
import { atUtc, fmt3 } from "@/lib/format";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, LG, seasonLabel } from "@/lib/leagues";
import { LOCALE_TAG } from "@/lib/locale";
import { pageMeta } from "@/lib/meta";
import { recordText } from "@/lib/record";
import { datePath, describeRounds, deriveSeries, nickname, pairSchema, rankIn, scoreText, scoreWords, seriesPath, type Series } from "@/lib/series";
import { SERIES_COPY, sayFor, type Say } from "@/lib/seriesCopy";
import { seriesLooks } from "@/lib/seriesLooks";
import { getPairGames, getPlayoffGames, getSeasonStandings } from "@/lib/seriesData";
import { recShare, tableOf } from "@/lib/sort";
import "@/components/series.css";

// Rendered per request, like the other pages that speak the reader's language; its data comes from the hour-long cache.

const yearOf = (v: string) => (/^\d{4}$/.test(v) ? Number(v) : null);
const unitKey = (lg: string) => (lg === "nhl" ? "unit.nhl" : lg === "mlb" ? "unit.mlb" : "unit.other");

/** The season's series, the one asked for, and what the page puts beside it. */
const load = cache(async (lg: string, y: number, a: number, b: number, meeting: number) => {
  const [playoffs, regular, standings, brands, abbrs] = await Promise.all([getPlayoffGames(lg, y), getPairGames(lg, y, a, b, "regular"), getSeasonStandings(lg, y), getBrands(), getAbbrs(lg)]);
  const all = deriveSeries(lg, y, playoffs);
  const series = all.find((s) => s.meeting === meeting && s.sides.some((t) => t.f === a) && s.sides.some((t) => t.f === b)) ?? null;
  return { all, series, regular, standings, brands, abbrs };
});

function roundOf(lg: string, y: number, all: Series[], s: Series, say: Say) {
  const { round, names } = describeRounds(lg, y, all, say);
  const i = all.indexOf(s);
  return { title: names[round[i] - 1] ?? say("page.playoffs"), number: round[i], rounds: names.length };
}

export async function generateMetadata({ params }: PageProps<"/[league]/[year]/series/[pair]">): Promise<Metadata> {
  const { league, year, pair } = await params;
  const y = yearOf(year), p = pairSchema.safeParse(pair);
  if (!isLeague(league) || y == null || !p.success) return {};
  const [d, sp] = await Promise.all([load(league, y, p.data.a, p.data.b, p.data.meeting), currentSpeaker()]);
  if (!d.series) return { robots: { index: false } };
  const say = sayFor(sp);
  const s = d.series, [a, b] = s.sides;
  const round = roundOf(league, y, d.all, s, say).title;
  const season = seasonLabel(league, y);
  return pageMeta({
    title: say("page.metaTitle", { a: a.name, b: b.name, season, league: LG[league], round }),
    description: s.winner == null
      ? say("page.metaMet", { a: a.name, b: b.name, season, round })
      : say("page.metaBeat", { a: a.name, b: b.name, score: scoreWords(s, say), season, round }),
    path: seriesPath(league, y, s),
    locale: sp.locale,
  });
}

const tally = (rec: StandingRow | undefined) => (rec && rec.w != null ? recordText({ w: rec.w, l: rec.l ?? 0, t: rec.t, otl: rec.otl }) : null);
const perGame = (v: number | null | undefined, gp: number | null | undefined) => (v != null && gp ? v / gp : null);

interface Metric { label: string; a: number | null; b: number | null; text: (v: number) => string; low?: boolean; ta?: string | null; tb?: string | null }

/** The two teams' regular seasons as rows of paired bars. */
function metrics(say: Say, unit: string, ra: StandingRow | undefined, rb: StandingRow | undefined): Metric[] {
  const lower = unit.toLowerCase();
  const g1 = (v: number) => v.toFixed(2);
  const out: Metric[] = [];
  if (ra?.pct != null && rb?.pct != null) out.push({ label: say("cmp.share"), a: ra.pct, b: rb.pct, text: fmt3, ta: tally(ra), tb: tally(rb) });
  if (ra?.pts != null && rb?.pts != null) out.push({ label: say("cmp.points"), a: ra.pts, b: rb.pts, text: (v) => String(v) });
  const fa = perGame(ra?.pf, ra?.gp), fb = perGame(rb?.pf, rb?.gp);
  const aa = perGame(ra?.pa, ra?.gp), ab = perGame(rb?.pa, rb?.gp);
  if (fa != null && fb != null) out.push({ label: say("cmp.for", { unit: lower }), a: fa, b: fb, text: g1 });
  if (aa != null && ab != null) out.push({ label: say("cmp.against", { unit: lower }), a: aa, b: ab, text: g1, low: true });
  for (const [k, label] of [["home", say("cmp.home")], ["road", say("cmp.road")]] as const) {
    const x = recShare(ra?.[k]), y = recShare(rb?.[k]);
    if (x != null && y != null) out.push({ label, a: x, b: y, text: fmt3, ta: ra?.[k], tb: rb?.[k] });
  }
  return out;
}

function CompareRow({ m }: { m: Metric }) {
  const top = Math.max(m.a ?? 0, m.b ?? 0) || 1;
  const better = m.a === m.b ? null : (m.a! > m.b!) !== !!m.low ? 0 : 1;
  const half = (i: 0 | 1, v: number | null, t: string | null | undefined) => (
    <span className={`half ${i === 0 ? "a" : "b"}${better === i ? " best" : ""}`}>
      <span className="val">{v != null ? m.text(v) : "—"}{t ? <small>{t}</small> : null}</span>
      <span className="track"><i style={{ width: `${v != null ? Math.max(3, (100 * v) / top) : 0}%`, background: i === 0 ? "var(--ca)" : "var(--cb)" }} /></span>
    </span>
  );
  return (
    <div className="cmprow">
      {half(0, m.a, m.ta)}
      <span className="lab">{m.label}</span>
      {half(1, m.b, m.tb)}
    </div>
  );
}

/** The chart words a client component needs, still holding their {placeholders}. */
const chartWords = (): ChartWords => ({
  perGame: SERIES_COPY["charts.perGame"], margin: SERIES_COPY["charts.margin"], soFar: SERIES_COPY["charts.soFar"], won: SERIES_COPY["charts.won"],
  ariaScored: SERIES_COPY["chart.aria.scored"], ariaMargin: SERIES_COPY["chart.aria.margin"], ariaTotal: SERIES_COPY["chart.aria.total"], ariaWon: SERIES_COPY["chart.aria.won"],
  none: SERIES_COPY["chart.none"], tipGame: SERIES_COPY["chart.tipGame"], tipGameOt: SERIES_COPY["chart.tipGameOt"], tied: SERIES_COPY["chart.tied"],
  by: SERIES_COPY["chart.by"], after: SERIES_COPY["chart.after"],
});

export default async function SeriesPage({ params }: PageProps<"/[league]/[year]/series/[pair]">) {
  const { league: lg, year, pair } = await params;
  const y = yearOf(year), p = pairSchema.safeParse(pair);
  if (!isLeague(lg) || y == null || !p.success) notFound();
  const [d, summary, sp] = await Promise.all([load(lg, y, p.data.a, p.data.b, p.data.meeting), getSummary(), currentSpeaker()]);
  if (!d.series) notFound();
  const s = d.series;
  // One address per series: the winner first.
  if (seriesPath(lg, y, s) !== `/${lg}/${y}/series/${pair}`) permanentRedirect(seriesPath(lg, y, s));

  const say = sayFor(sp), { fmt, dt } = sp;
  const { title: roundTitle, number, rounds } = roundOf(lg, y, d.all, s, say);
  const lastRound = d.all.filter((x) => roundOf(lg, y, d.all, x, say).number === rounds).length;
  const [A, B] = s.sides;
  const na = nickname(A.name), nb = nickname(B.name);
  const season = seasonLabel(lg, y);
  const [la, lb] = seriesLooks(lg, brandFor(d.brands, A.f, y), brandFor(d.brands, B.f, y));
  const unit = say(unitKey(lg));
  const single = s.games.length === 1;
  const champion = titleHolders(summary.seasons, lg).byYear.get(y)?.champion_franchise;
  const crowned = number === rounds && lastRound === 1 && s.winner === 0 && champion === A.f;
  const ra = d.standings.find((r) => r.franchise_id === A.f), rb = d.standings.find((r) => r.franchise_id === B.f);
  const rankText = (f: number) => {
    const r = rankIn(d.standings, f);
    return r ? say("side.rank", { place: fmt(r.place), total: fmt(r.of), league: LG[lg] }) : null;
  };

  const settled = s.winner != null;
  const n = s.games.length;
  const verdict =
    !settled ? say("verdict.unsettled")
      : s.basis === "goals" ? say("verdict.total", { team: na })
        : single ? say("verdict.one", { team: na })
          : B.wins === 0 ? say("verdict.sweep", { team: na }) : say("verdict.inN", { team: na, count: fmt(n) });
  const lede = !settled
    ? say("page.ledeUnsettled", { a: A.name, b: B.name, season, round: roundTitle })
    : single
      ? say("page.ledeOne", { a: A.name, b: B.name, score: scoreText(s), season, round: roundTitle, date: dt.full(atUtc(s.end)) })
      : say("page.ledeMany", { a: A.name, b: B.name, words: scoreWords(s, say), season, round: roundTitle, from: dt.monthDayShort(atUtc(s.start)), to: dt.full(atUtc(s.end)) });

  const chartGames = s.games.map((g) => ({ n: g.n, date: g.date, score: g.score, winner: g.winner, ot: g.ot, run: g.run }));
  const extra = say(lg === "mlb" ? "extras" : "ot");
  const sources = [...new Set(s.games.map((g) => g.source))];

  // Regular-season meetings of the two clubs.
  const meets = d.regular.filter((g) => g.status === "final" && g.home_score != null && g.away_score != null);
  const winsIn = (f: number) => meets.filter((g) => (g.home_f === f && g.home_score! > g.away_score!) || (g.away_f === f && g.away_score! > g.home_score!)).length;
  const forIn = (f: number) => meets.reduce((t, g) => t + (g.home_f === f ? g.home_score! : g.away_f === f ? g.away_score! : 0), 0);
  const meetTable = tableOf(meets, [
    { key: "date", label: say("h2h.date"), cls: "seasoncell", get: (g: GameRow) => g.game_date, cell: (g: GameRow) => <Link href={datePath(lg, y, g.game_date, "regular")} prefetch={false}>{dt.dayName(atUtc(g.game_date))}</Link> },
    { key: "away", label: say("h2h.away"), cls: "team", get: (g: GameRow) => g.away, cell: (g: GameRow) => <span className={g.away_score! > g.home_score! ? "won" : undefined}>{g.away}</span> },
    { key: "score", label: say("h2h.score"), num: true, get: (g: GameRow) => g.away_score! - g.home_score!, cell: (g: GameRow) => `${g.away_score}–${g.home_score}${g.overtime ? ` ${extra}` : ""}` },
    { key: "home", label: say("h2h.home"), cls: "team", get: (g: GameRow) => g.home, cell: (g: GameRow) => <span className={g.home_score! > g.away_score! ? "won" : undefined}>{g.home}</span> },
  ], (g) => g.game_id);

  // Each team's other series of the playoffs, in the order played.
  const desc = describeRounds(lg, y, d.all, say);
  const road = (f: number) => d.all.filter((x) => x !== s && x.sides.some((t) => t.f === f)).map((x) => ({ x, name: desc.names[desc.round[d.all.indexOf(x)] - 1] }));

  const mets = metrics(say, unit, ra, rb);
  const side = (i: 0 | 1) => {
    const t = s.sides[i], r = i === 0 ? ra : rb, rk = rankText(t.f);
    const logo = logoFor(d.brands, t.f, y);
    const won = s.winner === i;
    return (
      <div className={`sdside ${i === 0 ? "a" : "b"}${s.winner != null && !won ? " lost" : ""}`}>
        <span className="crest">{logo ? <TeamLogo url={logo} size={64} /> : <span className="mono">{abbrFor(d.abbrs, t.f, y, t.name)}</span>}</span>
        <h2 className="sdname"><Link href={`/${lg}/${y}/team/${t.f}`} prefetch={false} title={say("side.games.title", { team: t.name, season })}>{t.name}</Link></h2>
        {won ? <span className="wintag">{crowned ? <><BadgeCup league={lg} />{say("side.champions", { season })}</> : say("side.won")}</span> : null}
        <span className="sdmeta">{r && tally(r) ? say("side.record", { record: tally(r)! }) + (r.pts != null ? say("side.pts", { pts: fmt(r.pts) }) : "") : say("side.noRecord")}</span>
        {rk ? <span className="sdmeta">{rk}</span> : null}
        <span className="sdlinks"><Link href={`/${lg}/${y}/team/${t.f}`} prefetch={false}>{say("side.games", { season })}</Link><Link href={`/${lg}/team/${t.f}`} prefetch={false}>{say("side.allSeasons")}</Link></span>
      </div>
    );
  };

  return (
    <>
      <AccentStyle league={lg} />
      <SeriesStyle a={la} b={lb} />
      <section className="head fade">
        <span className="eyebrow">
          <Link href={`/${lg}`}>{LG[lg]}</Link>{" · "}<Link href={`/${lg}/${y}`}>{say("page.seasonLink", { season })}</Link>{" · "}<Link href={`/${lg}/${y}#playoffs`}>{say("page.playoffs")}</Link>
        </span>
        <h1>{roundTitle}</h1>
        <p className="lede">{lede}</p>
      </section>

      <section className="showdown" aria-label={say("page.aria", { a: A.name, b: B.name })}>
        {side(0)}
        <div className="sdmid">
          <div className="bigscore" aria-label={say("score.aria", { a: single ? s.games[0].score[0] ?? "–" : s.basis === "goals" ? A.scored : A.wins, b: single ? s.games[0].score[1] ?? "–" : s.basis === "goals" ? B.scored : B.wins })}>
            <b className={`n a${s.winner === 0 ? " w" : ""}`}>{single ? s.games[0].score[0] ?? "–" : s.basis === "goals" ? A.scored : A.wins}</b>
            <span className="dash" aria-hidden="true">–</span>
            <b className={`n b${s.winner === 1 ? " w" : ""}`}>{single ? s.games[0].score[1] ?? "–" : s.basis === "goals" ? B.scored : B.wins}</b>
          </div>
          <span className="verdict">{verdict}</span>
          <span className="sdnote">{s.basis === "goals" ? say("verdict.noteTotal") : single ? say("verdict.noteOne") : s.ties ? say("verdict.noteGamesTied", { count: fmt(n), ties: fmt(s.ties) }) : say("verdict.noteGames", { count: fmt(n) })}</span>
        </div>
        {side(1)}
      </section>

      <section className="section">
        <h2>{say("games.title")}</h2>
        <p className="note">{say("games.note")}</p>
        <ol className="gamestrip">
          {s.games.map((g) => {
            const awayIdx: 0 | 1 = g.home === 0 ? 1 : 0;
            const run = g.run;
            const hi = Math.max(...run), lo = Math.min(...run);
            const lead = run[0] === run[1]
              ? say("games.tied", { a: fmt(run[0]), b: fmt(run[1]) })
              : say(g.n === n && settled ? "games.win" : "games.lead", { team: run[0] > run[1] ? na : nb, a: fmt(hi), b: fmt(lo) });
            const row = (i: 0 | 1) => (
              <span className={`grow${g.winner === i ? " won" : ""}`} key={i}>
                <i className="pip" style={{ background: i === 0 ? "var(--ca)" : "var(--cb)" }} />
                <span className="nm" title={s.sides[i].name}>{i === 0 ? na : nb}</span>
                <b>{g.score[i] ?? "–"}</b>
              </span>
            );
            return (
              <li key={g.id} className="gtile" style={{ "--tc": g.winner == null ? "var(--rule)" : g.winner === 0 ? "var(--ca)" : "var(--cb)" } as React.CSSProperties}>
                <span className="ghead">
                  <b>{single ? say("games.theGame") : say("games.gameN", { n: fmt(g.n) })}</b>
                  {g.ot ? <span className="badge">{extra}</span> : null}
                  <Link href={datePath(lg, y, g.date, "playoffs")} prefetch={false} title={say("games.dayTitle")}>{dt.monthDayShort(atUtc(g.date))}</Link>
                </span>
                {row(awayIdx)}
                {row(g.home)}
                <span className="gnote"><span className="at">{say("games.atHome", { team: s.sides[g.home].name })}</span>{!single ? <span className="run">{lead}</span> : null}</span>
              </li>
            );
          })}
        </ol>
        <p className="note">{say("games.foot")} {sources.length ? <>{say("games.source")} {sources.map((src) => <Badge key={src} src={src} />)}</> : null}</p>
      </section>

      {s.games.some((g) => g.score[0] != null) ? (
        <section className="section">
          <h2>{say("charts.title")}</h2>
          <SeriesCharts games={chartGames} names={[na, nb]} unit={unit} words={chartWords()} />
        </section>
      ) : null}

      {mets.length ? (
        <section className="section">
          <h2>{say("cmp.title")}</h2>
          <p className="note">{say("cmp.note", { season })}</p>
          <div className="cmp">
            <div className="cmphead"><b style={{ color: "var(--ca)" }}>{na}</b><span /><b style={{ color: "var(--cb)" }}>{nb}</b></div>
            {mets.map((m) => <CompareRow key={m.label} m={m} />)}
          </div>
        </section>
      ) : null}

      <section className="section">
        <h2>{say("h2h.title")}</h2>
        {meets.length ? (
          <>
            <p className="note">{say("h2h.note", {
              a: na, b: nb, aw: fmt(winsIn(A.f)), bw: fmt(winsIn(B.f)), af: fmt(forIn(A.f)), bf: fmt(forIn(B.f)), unit: unit.toLowerCase(),
              games: say(new Intl.PluralRules(LOCALE_TAG[sp.locale]).select(meets.length) === "one" ? "h2h.games.one" : "h2h.games.other", { count: fmt(meets.length) }),
            })}</p>
            <div className="tablebox"><SortTable {...meetTable} param="sort_meet" def="date.asc" /></div>
          </>
        ) : <p className="note">{say("h2h.none", { season })}</p>}
      </section>

      {[A, B].some((t) => road(t.f).length) ? (
        <section className="section">
          <h2>{say("road.title")}</h2>
          <p className="note">{say("road.note")}</p>
          <div className="roads">
            {([0, 1] as const).map((i) => {
              const list = road(s.sides[i].f);
              return list.length ? (
                <div key={i} className="road">
                  <h3 style={{ color: i === 0 ? "var(--ca)" : "var(--cb)" }}>{i === 0 ? na : nb}</h3>
                  {list.map(({ x, name }) => (
                    <div key={`${x.sides[0].f}-${x.sides[1].f}-${x.meeting}`}><span className="rn">{name}</span><SeriesCard lg={lg} s={x} brands={d.brands} year={y} say={say} /></div>
                  ))}
                </div>
              ) : null;
            })}
          </div>
        </section>
      ) : null}
    </>
  );
}
