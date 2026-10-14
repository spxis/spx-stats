import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { AccentStyle } from "@/components/AccentStyle";
import { GameSurface, type DrawnGame } from "@/components/GameSurface";
import { SeriesCard } from "@/components/SeasonPlayoffs";
import { SeriesCharts, type ChartWords } from "@/components/SeriesCharts";
import { SeriesStyle } from "@/components/SeriesStyle";
import { Showdown, type ShowdownSide } from "@/components/Showdown";
import { SortTable } from "@/components/SortTable";
import { TeamLabel } from "@/components/TeamLabel";
import { TeamLogo } from "@/components/TeamLogo";
import { BadgeCup } from "@/components/TrophyIcon";
import { Badge } from "@/components/ui";
import type { GameRow, StandingRow } from "@/lib/api/types";
import { brandFor, logoFor } from "@/lib/brand";
import { titleHolders } from "@/lib/champions";
import { getAbbrs, getBrands, getSummary } from "@/lib/data";
import { abbrFor } from "@/lib/abbr";
import { atUtc, fmt3 } from "@/lib/format";
import { gamePath } from "@/lib/gamePath";
import { pairPath, pairSeasonPath } from "@/lib/h2h";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, LG, seasonLabel } from "@/lib/leagues";
import { LOCALE_TAG } from "@/lib/locale";
import { pageMeta } from "@/lib/meta";
import { recordText } from "@/lib/record";
import { datedRound, datePath, describeRounds, deriveSeries, nickname, playedYear, rankIn, roundPath, roundTitle as nameOfRound, scoreText, scoreWords, seriesPath, type Series } from "@/lib/series";
import { roundSay } from "@/lib/roundWords";
import { SERIES_COPY, type Say } from "@/lib/seriesCopy";
import { seriesLooks } from "@/lib/seriesLooks";
import { loadPastMeetings, type PastMeeting } from "@/lib/playoffs";
import { getPairGames } from "@/lib/h2hData";
import { getPlayoffGames, getSeasonStandings } from "@/lib/seriesData";
import { parseSeasonSeg, seasonPath } from "@/lib/slug";
import { recShare, tableOf } from "@/lib/sort";
import { getPaths, pairOf } from "@/lib/teamSlugs";
import "@/components/series.css";
import "@/components/game.css";
import { guard, guardMeta } from "@/lib/loadGuard";

// Kept and revalidated every hour, once per language (lib/routing.ts); its data comes from the hour-long cache.

const unitKey = (lg: string) => (lg === "nhl" ? "unit.nhl" : lg === "mlb" ? "unit.mlb" : "unit.other");

/** The season's series, the one asked for, and what the page puts beside it. */
const load = cache(async (lg: string, y: number, a: number, b: number, meeting: number) => {
  const [playoffs, regular, standings, brands, abbrs] = await Promise.all([getPlayoffGames(lg, y), getPairGames(lg, y, a, b, "regular"), getSeasonStandings(lg, y).catch(() => null), getBrands(), getAbbrs(lg)]);
  const all = deriveSeries(lg, y, playoffs);
  const series = all.find((s) => s.meeting === meeting && s.sides.some((t) => t.f === a) && s.sides.some((t) => t.f === b)) ?? null;
  return { all, series, regular, standings, brands, abbrs };
});

function roundOf(lg: string, y: number, all: Series[], s: Series, say: Say, robin: string) {
  const { round, names, final } = describeRounds(lg, y, all, say);
  const i = all.indexOf(s);
  const name = nameOfRound(names, round[i], robin);
  return { title: name || say("page.playoffs"), dated: name ? datedRound(lg, y, playedYear(s), name, round[i] === final, say) : say("page.playoffs"), number: round[i], rounds: names.length };
}

// Nothing is drawn at build time: each address is drawn on its first visit, then kept and revalidated like the rest.
export const generateStaticParams = () => [];

export const generateMetadata = guardMeta(async ({ params }: PageProps<"/[locale]/s/[league]/[year]/series/[pair]">): Promise<Metadata> => {
  const { league, year, pair } = await params;
  const ys = isLeague(league) ? parseSeasonSeg(league, year) : null;
  if (!isLeague(league) || !ys) return {};
  const y = ys.y;
  const p = await pairOf(league, y, pair);
  if (!p) return {};
  const [d, sp, paths] = await Promise.all([load(league, y, p.a, p.b, p.meeting), currentSpeaker(), getPaths()]);
  if (!d.series) return { robots: { index: false } };
  const say = roundSay(sp);
  const s = d.series, [a, b] = s.sides;
  const { title: round, dated } = roundOf(league, y, d.all, s, say, sp.say("playoffs.robin"));
  const season = seasonLabel(league, y);
  return pageMeta({
    title: say("page.metaTitle", { a: a.name, b: b.name, round: dated }),
    description: s.live
      ? say(a.wins === b.wins ? "page.metaLevel" : "page.metaLive", { a: a.name, b: b.name, x: a.wins, y: b.wins, season, round })
      : s.winner == null
        ? say("page.metaMet", { a: a.name, b: b.name, season, round })
        : say("page.metaBeat", { a: a.name, b: b.name, score: scoreWords(s, say), season, round }),
    path: seriesPath(paths, league, y, s),
    locale: sp.locale,
  });
});

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

export default guard(async function SeriesPage({ params }: PageProps<"/[locale]/s/[league]/[year]/series/[pair]">) {
  const { league: lg, year, pair } = await params;
  const ys = isLeague(lg) ? parseSeasonSeg(lg, year) : null;
  if (!isLeague(lg) || !ys) notFound();
  const y = ys.y;
  const p = await pairOf(lg, y, pair);
  if (!p) notFound();
  const [d, summary, sp, paths] = await Promise.all([load(lg, y, p.a, p.b, p.meeting), getSummary(), currentSpeaker(), getPaths()]);
  if (!d.series) notFound();
  const s = d.series;
  // One address per decided series: the winner first, the teams by that season's names. A series in progress has no winner yet, so it answers at either order
  // (redirecting for good while the lead changes hands would leave a visitor's browser with the wrong address).
  if (!s.live && seriesPath(paths, lg, y, s) !== `/${lg}/${year}/series/${pair}`) permanentRedirect(seriesPath(paths, lg, y, s));

  const say = roundSay(sp), { fmt, dt } = sp;
  const { title: roundTitle, dated: roundDated, number, rounds } = roundOf(lg, y, d.all, s, say, sp.say("playoffs.robin"));
  const lastRound = d.all.filter((x) => roundOf(lg, y, d.all, x, say, "").number === rounds).length;
  const [A, B] = s.sides;
  const na = nickname(A.name), nb = nickname(B.name);
  const season = seasonLabel(lg, y);
  const [la, lb] = seriesLooks(lg, brandFor(d.brands, A.f, y), brandFor(d.brands, B.f, y));
  const unit = say(unitKey(lg));
  const single = s.games.length === 1;
  const champion = titleHolders(summary.seasons, lg).byYear.get(y)?.champion_franchise;
  const crowned = number === rounds && lastRound === 1 && s.winner === 0 && champion === A.f;
  const standings = d.standings ?? [];
  const ra = standings.find((r) => r.franchise_id === A.f), rb = standings.find((r) => r.franchise_id === B.f);
  const rankText = (f: number) => {
    const r = rankIn(standings, f);
    return r ? say("side.rank", { place: fmt(r.place), total: fmt(r.of), league: LG[lg] }) : null;
  };

  const settled = s.winner != null;
  const played = s.games.filter((g) => g.played).length;
  const n = s.games.length;
  const level = A.wins === B.wins;
  const verdict =
    s.live ? say(level ? "games.tied" : "games.lead", { team: na, a: fmt(A.wins), b: fmt(B.wins) })
    : !settled ? say("verdict.unsettled")
      : s.basis === "goals" ? say("verdict.total", { team: na })
        : single ? say("verdict.one", { team: na })
          : B.wins === 0 ? say("verdict.sweep", { team: na }) : say("verdict.inN", { team: na, count: fmt(n) });
  const lede = s.live
    ? say(level ? "page.ledeLevel" : "page.ledeLive", { a: A.name, b: B.name, x: fmt(A.wins), y: fmt(B.wins), season, round: roundTitle, date: dt.full(atUtc(s.next!)) })
    : !settled
    ? say("page.ledeUnsettled", { a: A.name, b: B.name, season, round: roundTitle })
    : single
      ? say("page.ledeOne", { a: A.name, b: B.name, score: scoreText(s), season, round: roundTitle, date: dt.full(atUtc(s.end)) })
      : say("page.ledeMany", { a: A.name, b: B.name, words: scoreWords(s, say), season, round: roundTitle, from: dt.monthDayShort(atUtc(s.start)), to: dt.full(atUtc(s.end)) });

  const chartGames = s.games.filter((g) => g.played).map((g) => ({ n: g.n, date: g.date, score: g.score, winner: g.winner, ot: g.ot, run: g.run }));
  const extra = say(lg === "mlb" ? "extras" : "ot");
  const sources = [...new Set(s.games.map((g) => g.source))];

  // The game the series was settled in (or, while it is on, the latest played), drawn on its surface.
  const last = s.games.filter((g) => g.played && g.score[0] != null && g.score[1] != null).at(-1);
  const drawnGame: DrawnGame | null = last ? {
    id: last.id, date: last.date, phase: "playoffs", final: number === rounds && lastRound === 1, overtime: last.ot,
    home: { f: s.sides[last.home].f, name: s.sides[last.home].name, score: last.score[last.home] },
    away: { f: s.sides[last.home === 0 ? 1 : 0].f, name: s.sides[last.home === 0 ? 1 : 0].name, score: last.score[last.home === 0 ? 1 : 0] },
  } : null;
  const surfaceHead = single ? sp.say("gs.headGame") : settled && !s.live ? sp.say("gs.headDeciding") : sp.say("gs.headLatest");

  // Regular-season meetings of the two clubs.
  const meets = d.regular.filter((g) => g.status === "final" && g.home_score != null && g.away_score != null);
  const winsIn = (f: number) => meets.filter((g) => (g.home_f === f && g.home_score! > g.away_score!) || (g.away_f === f && g.away_score! > g.home_score!)).length;
  const forIn = (f: number) => meets.reduce((t, g) => t + (g.home_f === f ? g.home_score! : g.away_f === f ? g.away_score! : 0), 0);
  const meetTable = tableOf(meets, [
    { key: "date", label: say("h2h.date"), cls: "seasoncell", get: (g: GameRow) => g.game_date, cell: (g: GameRow) => <Link href={datePath(lg, y, g.game_date, "regular")} prefetch={false}>{dt.dayName(atUtc(g.game_date))}</Link> },
    { key: "away", label: say("h2h.away"), cls: "team", get: (g: GameRow) => g.away, cell: (g: GameRow) => <span className={g.away_score! > g.home_score! ? "won" : undefined}><TeamLabel lg={lg} f={g.away_f} name={g.away} year={y} logo={logoFor(d.brands, g.away_f, y)} /></span> },
    { key: "score", label: say("h2h.score"), num: true, get: (g: GameRow) => g.away_score! - g.home_score!, cell: (g: GameRow) => `${g.away_score}–${g.home_score}${g.overtime ? ` ${extra}` : ""}` },
    { key: "home", label: say("h2h.home"), cls: "team", get: (g: GameRow) => g.home, cell: (g: GameRow) => <span className={g.home_score! > g.away_score! ? "won" : undefined}><TeamLabel lg={lg} f={g.home_f} name={g.home} year={y} logo={logoFor(d.brands, g.home_f, y)} /></span> },
  ], (g) => g.game_id);

  // Each team's other series of the playoffs, in the order played.
  const desc = describeRounds(lg, y, d.all, say);
  const road = (f: number) => d.all.filter((x) => x !== s && x.sides.some((t) => t.f === f)).map((x) => {
    const r = desc.round[d.all.indexOf(x)], name = nameOfRound(desc.names, r, sp.say("playoffs.robin"));
    return { x, name: datedRound(lg, y, playedYear(x), name, r === desc.final, say) };
  });

  const past = await loadPastMeetings(lg, A.f, B.f, y, say, sp.say("playoffs.robin")).catch(() => null);
  const pastWon = (f: number) => (past ?? []).filter((m) => m.s.winner != null && m.s.sides[0].f === f).length;
  const pastGames = (f: number) => (past ?? []).reduce((n, m) => n + (m.s.sides.find((t) => t.f === f)?.wins ?? 0), 0);
  const lastMeet = past?.[0];
  const lastWinner = lastMeet?.s.winner != null ? lastMeet.s.sides[0] : null;
  const pastTable = tableOf(past ?? [], [
    { key: "season", label: sp.say("past.season"), cls: "seasoncell", get: (m: PastMeeting) => m.year, cell: (m: PastMeeting) => <Link href={seriesPath(paths, lg, m.year, m.s)} prefetch={false}>{seasonLabel(lg, m.year)}</Link> },
    { key: "round", label: sp.say("past.round"), cls: "team", get: (m: PastMeeting) => m.n, cell: (m: PastMeeting) => <Link href={roundPath(lg, m.year, m.n)} prefetch={false}>{m.round}</Link> },
    { key: "winner", label: sp.say("past.winner"), cls: "team", get: (m: PastMeeting) => (m.s.winner == null ? "" : m.s.sides[0].name), cell: (m: PastMeeting) => (m.s.winner == null ? (m.s.live ? sp.say("past.inProgress") : "–") : <span className="won"><TeamLabel lg={lg} f={m.s.sides[0].f} name={m.s.sides[0].name} year={m.year} logo={logoFor(d.brands, m.s.sides[0].f, m.year)} /></span>) },
    { key: "result", label: sp.say("past.result"), num: true, get: (m: PastMeeting) => m.s.sides[0].wins - m.s.sides[1].wins, cell: (m: PastMeeting) => <Link href={seriesPath(paths, lg, m.year, m.s)} prefetch={false}>{scoreText(m.s)}</Link> },
  ], (m) => `${m.year}-${m.s.meeting}`);
  const mets = metrics(say, unit, ra, rb);
  const side = (i: 0 | 1): ShowdownSide => {
    const t = s.sides[i], r = i === 0 ? ra : rb, rk = rankText(t.f);
    const logo = logoFor(d.brands, t.f, y);
    const won = s.winner === i;
    return {
      crest: logo ? <TeamLogo url={logo} size={88} shape="circle" /> : <span className="crest"><span className="mono">{abbrFor(d.abbrs, t.f, y, t.name)}</span></span>,
      name: <Link href={paths.teamSeason(lg, t.f, y)} prefetch={false} title={say("side.games.title", { team: t.name, season })}>{t.name}</Link>,
      tag: won ? (crowned ? <><BadgeCup league={lg} />{say("side.champions", { season })}</> : say("side.won")) : null,
      meta: [
        r && tally(r) ? say("side.record", { record: tally(r)! }) + (r.pts != null ? say("side.pts", { pts: fmt(r.pts) }) : "") : d.standings == null ? sp.say("load.failed") : say("side.noRecord"),
        ...(rk ? [rk] : []),
      ],
      links: [
        <Link key="season" href={paths.teamSeason(lg, t.f, y)} prefetch={false}>{say("side.games", { season })}</Link>,
        <Link key="all" href={paths.team(lg, t.f)} prefetch={false}>{say("side.allSeasons")}</Link>,
      ],
      lost: s.winner != null && !won,
    };
  };
  const shown = (i: 0 | 1) => (single ? s.games[0].score[i] ?? "–" : s.basis === "goals" ? s.sides[i].scored : s.sides[i].wins);

  return (
    <>
      <AccentStyle league={lg} />
      <SeriesStyle a={la} b={lb} />
      <section className="head fade">
        <span className="eyebrow">
          <Link href={`/${lg}`}>{LG[lg]}</Link>{" · "}<Link href={seasonPath(lg, y)}>{say("page.seasonLink", { season })}</Link>{" · "}<Link href={`${seasonPath(lg, y)}#playoffs`}>{say("page.playoffs")}</Link>
        </span>
        <h1>{roundDated}</h1>
        <p className="lede">{lede}</p>
      </section>

      <Showdown
        label={say("page.aria", { a: A.name, b: B.name })} a={side(0)} b={side(1)} winner={s.winner === 0 ? 0 : s.winner === 1 ? 1 : null}
        score={[shown(0), shown(1)]} scoreLabel={say("score.aria", { a: shown(0), b: shown(1) })}
        verdict={<>{s.winner != null ? <TeamLogo url={logoFor(d.brands, s.sides[s.winner].f, y)} size={36} shape="circle" /> : null}{verdict}</>}
        notes={[s.live ? say("verdict.noteLive", { bestOf: fmt(s.bestOf), played: fmt(played) }) : s.basis === "goals" ? say("verdict.noteTotal") : single ? say("verdict.noteOne") : s.ties ? say("verdict.noteGamesTied", { count: fmt(n), ties: fmt(s.ties) }) : say("verdict.noteGames", { count: fmt(n) })]}
      />

      {drawnGame && last ? (
        <section className="section">
          <h2>{surfaceHead}</h2>
          <GameSurface lg={lg} year={y} game={drawnGame} brands={d.brands} abbrs={d.abbrs}
            competition={single ? roundTitle : `${roundTitle} · ${say("games.gameN", { n: fmt(last.n) })}`} />
        </section>
      ) : null}

      <section className="section">
        <h2>{say("games.title")}</h2>
        <p className="note">{say("games.note")}</p>
        <ol className="gamestrip">
          {s.games.map((g) => {
            const awayIdx: 0 | 1 = g.home === 0 ? 1 : 0;
            const run = g.run;
            const hi = Math.max(...run), lo = Math.min(...run);
            const lead = !g.played
              ? run[0] === run[1]
                ? say("games.seriesTied", { a: fmt(run[0]), b: fmt(run[1]) })
                : say("games.seriesLead", { team: run[0] > run[1] ? na : nb, a: fmt(hi), b: fmt(lo) })
              : run[0] === run[1]
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
              <li key={g.id} className={`gtile${g.played ? "" : " ahead"}${g.ifNeeded ? " ifneeded" : ""}`} style={{ "--tc": g.winner == null ? "var(--rule)" : g.winner === 0 ? "var(--ca)" : "var(--cb)" } as React.CSSProperties}>
                <span className="ghead">
                  <b><Link href={gamePath(lg, y, g.id, s.sides[awayIdx].name, s.sides[g.home].name)} prefetch={false} title={sp.say("gm.viewGameTitle", { away: s.sides[awayIdx].name, home: s.sides[g.home].name })}>{single ? say("games.theGame") : say("games.gameN", { n: fmt(g.n) })}</Link></b>
                  {g.ot ? <span className="badge">{extra}</span> : null}
                  {g.ifNeeded ? <span className="badge">{say("games.ifNeeded")}</span> : null}
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

      <section className="section">
        <h2>{sp.say("past.title")}</h2>
        <p className="note"><Link href={pairSeasonPath(pairPath(paths, lg, A.f, B.f).path, season)} prefetch={false}>{sp.say("h2h.seriesLink", { a: na, b: nb })}</Link></p>
        {past == null ? <p className="note">{sp.say("load.failed")}</p> : past.length ? (
          <>
            <p className="note">
              {pastWon(A.f) === pastWon(B.f)
                ? sp.say("past.tied", { a: na, b: nb, x: fmt(pastWon(A.f)), y: fmt(pastWon(B.f)) })
                : sp.say("past.lead", { team: pastWon(A.f) > pastWon(B.f) ? na : nb, x: fmt(Math.max(pastWon(A.f), pastWon(B.f))), y: fmt(Math.min(pastWon(A.f), pastWon(B.f))) })}
              {" "}{sp.say("past.games", { a: na, b: nb, x: fmt(pastGames(A.f)), y: fmt(pastGames(B.f)) })}
              {" "}{lastMeet && lastWinner ? sp.say("past.last", { team: nickname(lastWinner.name), season: seasonLabel(lg, lastMeet.year) }) : lastMeet ? sp.say("past.lastOpen", { season: seasonLabel(lg, lastMeet.year) }) : null}
            </p>
            <div className="tablebox"><SortTable {...pastTable} param="sort_past" def="season.desc" /></div>
          </>
        ) : <p className="note">{sp.say("past.none", { a: na, b: nb, season })}</p>}
      </section>

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
                    <div key={`${x.sides[0].f}-${x.sides[1].f}-${x.meeting}`}><span className="rn">{name}{" · "}{dt.monthDayShort(atUtc(x.start))}{x.end !== x.start ? `–${dt.monthDayShort(atUtc(x.end))}` : ""}</span><SeriesCard paths={paths} lg={lg} s={x} brands={d.brands} year={y} say={say} /></div>
                  ))}
                </div>
              ) : null;
            })}
          </div>
        </section>
      ) : null}
    </>
  );
});
