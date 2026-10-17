import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AccentStyle } from "@/components/AccentStyle";
import { SeasonGrid, WinLossScatter, type ChartTeam } from "@/components/AllTimeCharts";
import { queryHref } from "@/components/ViewTabs";
import { RankBars, teamVars, type RankItem } from "@/components/RankBars";
import { SortTable } from "@/components/SortTable";
import { Spark } from "@/components/Spark";
import { TeamLabel } from "@/components/TeamLabel";
import { TeamLogo } from "@/components/TeamLogo";
import { Figures } from "@/components/ui";
import "@/components/alignment.css";
import "@/components/alltime.css";
import { brandFor, logoFor, teamAccent } from "@/lib/brand";
import { getBrands } from "@/lib/data";
import { share, lineOf, type Franchise } from "@/lib/allTime";
import { getAllTime } from "@/lib/allTimeData";
import { fmt3 } from "@/lib/format";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, LG, seasonLabel } from "@/lib/leagues";
import { pageMeta } from "@/lib/meta";
import { parseSort, tableOf } from "@/lib/sort";
import { getPaths } from "@/lib/teamSlugs";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";

const VIEWS = ["overview", "table", "charts"] as const;
const PHASES = [["all", "phase.all"], ["r", "phase.regular"], ["p", "phase.playoffs"]] as const;
const query = z.object({
  view: z.enum(VIEWS).catch("overview"),
  phase: z.enum(["r", "p", "all"]).catch("r"),
  active: z.enum(["1"]).optional().catch(undefined),
});
const UNIT = { nhl: "unit.goals", pwhl: "unit.goals", nba: "unit.points", wnba: "unit.points", mlb: "unit.runs", nfl: "unit.points", cfl: "unit.points", afl: "unit.points", aafc: "unit.points", nha: "unit.goals", pcha: "unit.goals", wchl: "unit.goals", wha: "unit.goals" } as const satisfies Record<string, PhraseKey>;
const MIN_SEASONS = 3;

export async function generateMetadata({ params }: PageProps<"/[locale]/q/[league]/all-time">): Promise<Metadata> {
  const { league } = await params;
  if (!isLeague(league)) return {};
  const { say, locale } = await currentSpeaker();
  return pageMeta({
    title: say("allTime.metaTitle", { league: LG[league] }),
    description: say("allTime.metaDesc", { league: LG[league] }),
    path: `/${league}/all-time`,
    locale,
  });
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AllTimePage({ params, searchParams }: PageProps<"/[locale]/q/[league]/all-time">) {
  const { league: lg } = await params;
  if (!isLeague(lg)) notFound();
  const sp = await searchParams;
  const { view, phase, active } = query.parse({ view: one(sp.view), phase: one(sp.phase), active: one(sp.active) });
  const { say, plural, fmt } = await currentSpeaker();
  const path = `/${lg}/all-time`;
  const head = (
    <section className="head fade">
      <span className="eyebrow"><Link href={`/${lg}`}>{LG[lg]}</Link></span>
      <h1>{say("allTime.title")}</h1>
    </section>
  );

  let data: Awaited<ReturnType<typeof getAllTime>>, brands: Awaited<ReturnType<typeof getBrands>>, paths: Awaited<ReturnType<typeof getPaths>>;
  try {
    [data, brands, paths] = await Promise.all([getAllTime(lg), getBrands(), getPaths()]);
  } catch {
    return <><AccentStyle league={lg} />{head}<p className="note">{say("load.failed")}</p></>;
  }

  const unit = say(UNIT[lg]);
  const shown = data.franchises
    .filter((t) => (!active || t.active) && (phase !== "p" || t.po.gp > 0))
    .sort((a, b) => a.first - b.first || a.name.localeCompare(b.name));
  const sharePh = (t: Franchise) => share(lineOf(t, phase));
  const seasonsPh = (t: Franchise) => (phase === "p" ? t.playoffs : t.seasons);
  const colours = (f: number) => {
    const a = teamAccent(brandFor(brands, f));
    return { tl: a.light, td: a.dark };
  };

  const ctl = (changes: Record<string, string | null>) => queryHref(path, sp, changes);
  const controls = (
    <div className="atcontrols">
      <nav className="seg views" aria-label={say("allTime.view.aria")}>
        {VIEWS.map((v) => (
          <Link key={v} href={ctl({ view: v === "overview" ? null : v })} prefetch={false} scroll={false} aria-current={v === view ? "page" : undefined}>{say(`allTime.view.${v}`)}</Link>
        ))}
      </nav>
      <nav className="seg views" aria-label={say("phase.aria")}>
        {PHASES.map(([k, label]) => (
          <Link key={k} href={ctl({ phase: k === "r" ? null : k })} prefetch={false} scroll={false} aria-current={k === phase ? "page" : undefined}>{say(label)}</Link>
        ))}
      </nav>
      <nav className="seg views">
        <Link href={ctl({ active: active ? null : "1" })} prefetch={false} scroll={false} aria-current={active ? "page" : undefined}>{say("allTime.activeOnly")}</Link>
      </nav>
    </div>
  );

  const lede = (
    <p className="lede">{say("allTime.lede", {
      franchises: plural("count.franchises", data.franchises.length), seasons: plural("count.seasons", data.seasons),
      first: seasonLabel(lg, data.first), last: seasonLabel(lg, data.last),
    })}</p>
  );

  if (!shown.length) {
    return <><AccentStyle league={lg} />{head}{lede}{controls}<p className="note">{say("allTime.none")}</p></>;
  }

  const recText = (r: { w: number; l: number; t: number; otl: number }) => `${r.w}–${r.l}${r.t ? `–${r.t}` : ""}${r.otl ? `–${r.otl}` : ""}`;
  const showT = shown.some((t) => lineOf(t, phase).t > 0), showO = shown.some((t) => lineOf(t, phase).otl > 0);
  const maxShare = Math.max(0.0001, ...shown.map((t) => sharePh(t) ?? 0));
  const recent = (t: Franchise) => {
    const last = t.years.filter((y) => y.eligible && y.share != null).slice(-10);
    return last.length ? last.reduce((a, y) => a + (y.share ?? 0), 0) / last.length : null;
  };
  const diff = (t: Franchise) => { const l = lineOf(t, phase); return l.pf - l.pa; };
  const seasonCell = (t: Franchise, m: Franchise["best"]) => m ? (
    <><Link href={paths.teamSeason(lg, t.f, m.year)} prefetch={false}>{seasonLabel(lg, m.year)}</Link><span className="sub">{fmt3(m.share ?? 0)}</span></>
  ) : "";

  const table = tableOf(shown, [
    {
      key: "team", label: say("col.team"), cls: "team", get: (t) => t.name,
      cell: (t) => (
        <span className="at-c" style={teamVars(colours(t.f))}>
          <span className="nm">
            <TeamLabel lg={lg} f={t.f} name={t.name} abbr={t.abbr} logo={logoFor(brands, t.f)} />
            {t.former.length ? <small className="former">{say("allTime.former", { names: t.former.join(", ") })}</small> : null}
          </span>
        </span>
      ),
    },
    { key: "years", label: say("col.years"), cls: "years", title: say("allTime.tip.years"), get: (t) => t.first, cell: (t) => (t.active ? `${t.first}–${say("allTime.present")}` : t.first === t.last ? String(t.first) : `${t.first}–${t.last}`) },
    { key: "seasons", label: say("col.seasons"), num: true, get: (t) => t.seasons },
    { key: "gp", label: say("col.gp"), num: true, get: (t) => lineOf(t, phase).gp, cell: (t) => fmt(lineOf(t, phase).gp) },
    { key: "w", label: say("col.w"), num: true, get: (t) => lineOf(t, phase).w, cell: (t) => fmt(lineOf(t, phase).w) },
    { key: "l", label: say("col.l"), num: true, get: (t) => lineOf(t, phase).l, cell: (t) => fmt(lineOf(t, phase).l) },
    ...(showT ? [{ key: "t", label: say("col.t"), num: true, get: (t: Franchise) => lineOf(t, phase).t }] : []),
    ...(showO ? [{ key: "otl", label: say("col.otl"), num: true, get: (t: Franchise) => lineOf(t, phase).otl }] : []),
    {
      key: "share", label: say("col.share"), num: true, title: say("allTime.tip.share"), get: sharePh,
      cell: (t) => {
        const s = sharePh(t);
        return s == null ? "" : <>{fmt3(s)}<span className="pctbar at-c" style={{ width: `${Math.round((56 * s) / maxShare)}px`, ...teamVars(colours(t.f)), background: "var(--c)" }} /></>;
      },
    },
    { key: "pf", label: say("col.pf"), num: true, title: say("allTime.tip.pf", { unit }), get: (t) => lineOf(t, phase).pf, cell: (t) => fmt(lineOf(t, phase).pf) },
    { key: "pa", label: say("col.pa"), num: true, title: say("allTime.tip.pa", { unit }), get: (t) => lineOf(t, phase).pa, cell: (t) => fmt(lineOf(t, phase).pa) },
    {
      key: "diff", label: say("col.diff"), num: true, title: say("allTime.tip.diff", { unit }), get: diff,
      cell: (t) => <span className={diff(t) > 0 ? "up" : diff(t) < 0 ? "down" : undefined}>{diff(t) > 0 ? "+" : diff(t) < 0 ? "−" : ""}{fmt(Math.abs(diff(t)))}</span>,
    },
    { key: "titles", label: say("col.titles"), num: true, get: (t) => t.titles.length },
    { key: "playoffs", label: say("col.playoffs"), num: true, title: say("allTime.tip.playoffs"), get: (t) => t.playoffs },
    { key: "best", label: say("col.best"), title: say("allTime.tip.best"), get: (t) => t.best?.share, cell: (t) => seasonCell(t, t.best) },
    { key: "worst", label: say("col.worst"), title: say("allTime.tip.worst"), get: (t) => t.worst?.share, cell: (t) => seasonCell(t, t.worst) },
    {
      key: "trend", label: say("col.trend"), title: say("allTime.tip.trend"), get: recent,
      cell: (t) => (
        <span className="at-c" style={teamVars(colours(t.f))}>
          <Spark points={t.years.filter((y) => y.eligible && y.share != null).map((y): [number, number] => [y.year, y.share!])} label={say("allTime.spark.aria", { team: t.name })} />
        </span>
      ),
    },
  ], (t) => t.f, (t) => (t.active ? undefined : "gone"));
  const known = table.columns.map((c) => c.key);
  const sort = parseSort(one(sp.sort), known, "w.desc");

  const hl = (k: PhraseKey, t: Franchise, value: string, sub: string) => (
    <Link key={k} className="at-c" style={teamVars(colours(t.f))} href={paths.team(lg, t.f)} prefetch={false}>
      <span className="k">{say(k)}</span>
      <span className="who"><TeamLogo url={logoFor(brands, t.f)} size={36} shape="square" /><span>{t.name}</span></span>
      <b>{value}</b>
      <span className="sub">{sub}</span>
    </Link>
  );
  const top = (list: Franchise[], by: (t: Franchise) => number) => [...list].sort((a, b) => by(b) - by(a) || (sharePh(b) ?? 0) - (sharePh(a) ?? 0))[0];
  const qualified = shown.filter((t) => seasonsPh(t) >= MIN_SEASONS);
  const ranked = qualified.length >= 8 ? qualified : shown;
  const bestShare = top(ranked.filter((t) => sharePh(t) != null), (t) => sharePh(t) ?? 0);
  const mostTitles = top(shown, (t) => t.titles.length);
  const mostWins = top(shown, (t) => lineOf(t, phase).w);
  const mostPlayoffs = top(shown, (t) => t.playoffs);
  const highlights = (
    <div className="athl">
      {bestShare ? hl("allTime.hl.share", bestShare, fmt3(sharePh(bestShare) ?? 0), recText(lineOf(bestShare, phase))) : null}
      {mostTitles && mostTitles.titles.length ? hl("allTime.hl.titles", mostTitles, fmt(mostTitles.titles.length), say("allTime.hl.last", { season: seasonLabel(lg, mostTitles.titles.at(-1)!) })) : null}
      {mostWins ? hl("allTime.hl.wins", mostWins, fmt(lineOf(mostWins, phase).w), plural("count.games", lineOf(mostWins, phase).gp)) : null}
      {mostPlayoffs && mostPlayoffs.playoffs ? hl("allTime.hl.playoffs", mostPlayoffs, fmt(mostPlayoffs.playoffs), plural("count.seasons", mostPlayoffs.seasons)) : null}
    </div>
  );

  const item = (t: Franchise, value: number, text: string, tip: string): RankItem => ({
    key: t.f, name: t.name, abbr: t.abbr, href: paths.team(lg, t.f), logo: logoFor(brands, t.f), ...colours(t.f), value, text, tip, gone: !t.active,
  });
  const byShare = [...ranked].filter((t) => sharePh(t) != null).sort((a, b) => sharePh(b)! - sharePh(a)!);
  const shareItems = byShare.map((t) => item(t, sharePh(t)!, fmt3(sharePh(t)!), `${t.name}: ${recText(lineOf(t, phase))}`));
  const titled = shown.filter((t) => t.titles.length).sort((a, b) => b.titles.length - a.titles.length || (sharePh(b) ?? 0) - (sharePh(a) ?? 0));
  const titleItems = titled.map((t) => item(t, t.titles.length, fmt(t.titles.length), `${t.name}: ${t.titles.map((y) => seasonLabel(lg, y)).join(", ")}`));
  const tripped = shown.filter((t) => t.playoffs).sort((a, b) => b.playoffs - a.playoffs || (sharePh(b) ?? 0) - (sharePh(a) ?? 0));
  const tripItems = tripped.map((t) => item(t, t.playoffs, fmt(t.playoffs), `${t.name}: ${plural("count.seasons", t.playoffs)}`));
  const more = (n: number) => say("allTime.showAll", { count: fmt(n) });
  const noChamps = <p className="note">{say("league.noChampions")}</p>;

  const chartTeams: ChartTeam[] = shown.map((t) => {
    const l = lineOf(t, phase);
    return {
      f: t.f, name: t.name, abbr: t.abbr, href: paths.team(lg, t.f), ...colours(t.f), active: t.active,
      w: l.w, l: l.l, t: l.t, otl: l.otl, share: share(l), titles: t.titles.length,
      grid: t.years.map((y): [number, number, number] => [y.year, y.eligible && y.share != null ? Math.round(y.share * 1000) / 1000 : -1, y.champion ? 1 : 0]),
    };
  });

  const league = data.franchises;
  const figs: [string, number | string][] = [
    [say("allTime.fig.franchises"), league.length],
    [say("allTime.fig.active"), league.filter((t) => t.active).length],
    [say("fig.seasons"), data.seasons],
    [say("fig.games"), Math.round(league.reduce((a, t) => a + lineOf(t, phase).gp, 0) / 2)],
    [say("allTime.fig.titles"), league.reduce((a, t) => a + t.titles.length, 0)],
  ];

  const tableSection = (
    <section className="section">
      <h2>{say("allTime.table")}</h2>
      <div className="tablebox attable"><SortTable {...table} def="w.desc" initial={sort} label={say("allTime.title")} /></div>
    </section>
  );

  const shareBlock = (limit: number, titleKey: PhraseKey) => (
    <div>
      <h2>{say(titleKey)}</h2>
      <p className="note">{say("allTime.chart.shareNote", { n: MIN_SEASONS })}</p>
      <RankBars items={shareItems} centre={0.5} limit={limit} more={more(shareItems.length)} label={say(titleKey)} />
    </div>
  );
  const titlesBlock = (limit: number) => (
    <div>
      <h2>{say("allTime.chart.titles")}</h2>
      <p className="note">{say("allTime.chart.titlesNote")}</p>
      {titleItems.length ? <RankBars items={titleItems} limit={limit} more={more(titleItems.length)} label={say("allTime.chart.titles")} /> : noChamps}
    </div>
  );

  return (
    <>
      <AccentStyle league={lg} />
      {head}
      {lede}
      {controls}
      <p className="note">{say(`allTime.note.${phase}`)} {say("allTime.note.common")}</p>
      <Figures items={figs} />
      {view !== "table" ? <section className="section">{highlights}</section> : null}
      {view === "overview" ? (
        <section className="section">
          <div className="atcharts">
            {shareBlock(10, "allTime.chart.share")}
            {titlesBlock(10)}
          </div>
        </section>
      ) : null}
      {view !== "charts" ? tableSection : null}
      {view === "charts" ? (
        <>
          <section className="section">
            <div className="atcharts">
              {shareBlock(14, "allTime.chart.share")}
              <div className="section">
                {titlesBlock(8)}
                <div>
                  <h2>{say("allTime.chart.playoffs")}</h2>
                  <p className="note">{say("allTime.chart.playoffsNote")}</p>
                  {tripItems.length ? <RankBars items={tripItems} limit={8} more={more(tripItems.length)} label={say("allTime.chart.playoffs")} /> : <p className="note">{say("chart.noResults")}</p>}
                </div>
              </div>
            </div>
          </section>
          <section className="section">
            <h2>{say("allTime.chart.scatter")}</h2>
            <p className="note">{say("allTime.chart.scatterNote")}</p>
            <div className="legend">
              <span><i className="dotted" style={{ background: "var(--accent)" }} />{say("allTime.legend.active")}</span>
              <span><i className="hollow" />{say("allTime.legend.defunct")}</span>
            </div>
            <WinLossScatter teams={chartTeams} />
          </section>
          <section className="section">
            <h2>{say("allTime.chart.grid")}</h2>
            <p className="note">{say("allTime.chart.gridNote")}</p>
            <div className="legend">
              <span><i className="warm" />{say("allTime.legend.above")}</span>
              <span><i className="mid" />{say("allTime.legend.even")}</span>
              <span><i className="cool" />{say("allTime.legend.below")}</span>
              <span><i className="champ" />{say("allTime.legend.title")}</span>
            </div>
            <SeasonGrid lg={lg} teams={chartTeams} first={data.first} last={data.last} />
          </section>
        </>
      ) : null}
    </>
  );
}
