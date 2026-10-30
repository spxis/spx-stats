import LoadNote from "@/components/LoadNote";
import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AccentStyle } from "@/components/AccentStyle";
import { AllTimeBars } from "@/components/AllTimeBars";
import { AllTimeChartLazy } from "@/components/AllTimeChartLazy";
import { AllTimeTable } from "@/components/AllTimeTable";
import { queryHref } from "@/components/ViewTabs";
import { RankBars, rankSpan, teamVars } from "@/components/RankBars";
import { TeamLogo } from "@/components/TeamLogo";
import { Figures } from "@/components/ui";
import "@/components/alignment.css";
import "@/components/alltime.css";
import { brandFor, logoFor, teamAccent } from "@/lib/brand";
import { barItems, MIN_SEASONS, type BarKind } from "@/lib/allTimeBars";
import { AT_HEAD, atKeys, atSort, lineAt as lineAtRow, pickAt, resolveAt, shownAt } from "@/lib/allTimeLines";
import { getBrands } from "@/lib/data";
import { share, lineOf, type Franchise } from "@/lib/allTime";
import { getAllTime, getAllTimeList } from "@/lib/allTimeData";
import { fmt3 } from "@/lib/format";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, LG, seasonLabel } from "@/lib/leagues";
import { pageMeta } from "@/lib/meta";
import { parseSort, sortRows } from "@/lib/sort";
import { getPaths } from "@/lib/teamSlugs";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";

const VIEWS = ["overview", "table", "charts"] as const;
const PHASES = [["all", "phase.all"], ["r", "phase.regular"], ["p", "phase.playoffs"]] as const;
const query = z.object({
  view: z.enum(VIEWS).catch("overview"),
  phase: z.enum(["r", "p", "all"]).catch("r"),
  active: z.enum(["1"]).optional().catch(undefined),
});

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

  let data: Awaited<ReturnType<typeof getAllTime>>, list: Awaited<ReturnType<typeof getAllTimeList>>, brands: Awaited<ReturnType<typeof getBrands>>, paths: Awaited<ReturnType<typeof getPaths>>;
  try {
    [data, list, brands, paths] = await Promise.all([getAllTime(lg), getAllTimeList(lg), getBrands(), getPaths()]);
  } catch {
    return <><AccentStyle league={lg} />{head}<LoadNote /></>;
  }

  const rows = resolveAt(list);
  const shownRows = shownAt(rows, phase, !!active);
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
  const showT = shownRows.some((t) => lineAtRow(t, phase).t > 0), showO = shownRows.some((t) => lineAtRow(t, phase).otl > 0);
  const maxShare = Math.max(0.0001, ...shown.map((t) => sharePh(t) ?? 0));

  // The table opens on its first rows in the order it is sorted by; the others are fetched (overview), or all of them are in the page (the table view).
  const known = atKeys(showT, showO);
  const sort = parseSort(one(sp.sort), known, "w.desc");
  const full = view === "table";
  const ordered = sortRows(shownRows, sort, (t, k) => atSort(t, k, phase));
  const tableHead = pickAt(full ? ordered : ordered.slice(0, AT_HEAD));

  const hl = (k: PhraseKey, t: Franchise, value: string, sub: string) => (
    <Link key={k} className="at-c" style={teamVars(colours(t.f))} href={paths.team(lg, t.f)} prefetch={false}>
      <span className="k">{say(k)}</span>
      <span className="who"><TeamLogo url={logoFor(brands, t.f)} size={36} shape="square" /><span>{t.name}</span></span>
      <b>{value}</b>
      <span className="sub">{sub}</span>
    </Link>
  );
  const top = (list: Franchise[], by: (t: Franchise) => number) => [...list].sort((a, b) => by(b) - by(a) || (sharePh(b) ?? 0) - (sharePh(a) ?? 0))[0];
  const mostTitles = top(shown, (t) => t.titles.length);
  const mostWins = top(shown, (t) => lineOf(t, phase).w);
  const mostPlayoffs = top(shown, (t) => t.playoffs);
  const qualified = shown.filter((t) => seasonsPh(t) >= MIN_SEASONS);
  const ranked = qualified.length >= 8 ? qualified : shown;
  const bestShare = top(ranked.filter((t) => sharePh(t) != null), (t) => sharePh(t) ?? 0);
  const highlights = (
    <div className="athl">
      {bestShare ? hl("allTime.hl.share", bestShare, fmt3(sharePh(bestShare) ?? 0), recText(lineOf(bestShare, phase))) : null}
      {mostTitles && mostTitles.titles.length ? hl("allTime.hl.titles", mostTitles, fmt(mostTitles.titles.length), say("allTime.hl.last", { season: seasonLabel(lg, mostTitles.titles.at(-1)!) })) : null}
      {mostWins ? hl("allTime.hl.wins", mostWins, fmt(lineOf(mostWins, phase).w), plural("count.games", lineOf(mostWins, phase).gp)) : null}
      {mostPlayoffs && mostPlayoffs.playoffs ? hl("allTime.hl.playoffs", mostPlayoffs, fmt(mostPlayoffs.playoffs), plural("count.seasons", mostPlayoffs.seasons)) : null}
    </div>
  );

  const more = (n: number) => say("allTime.showAll", { count: fmt(n) });
  const noChamps = <p className="note">{say("league.noChampions")}</p>;
  const barCtx = { lg, phase, active: !!active, paths, fmt, plural };
  const fullHref = ctl({ view: "table" });
  /** The first `limit` bars of a ranking; the rest are fetched when the disclosure under them is opened. */
  const bars = (kind: BarKind, limit: number, titleKey: PhraseKey, centre?: number) => {
    const items = barItems(kind, rows, barCtx);
    if (!items.length) return null;
    if (items.length <= limit) return <RankBars items={items} centre={centre} limit={limit} more={more(items.length)} label={say(titleKey)} />;
    return (
      <AllTimeBars kind={kind} lg={lg} phase={phase} active={!!active} items={items.slice(0, limit)} limit={limit} centre={centre} span={rankSpan(items, centre)}
        label={say(titleKey)} more={more(items.length)} fullHref={fullHref} />
    );
  };

  const figs: [string, number | string][] = [
    [say("allTime.fig.franchises"), data.franchises.length],
    [say("allTime.fig.active"), data.franchises.filter((t) => t.active).length],
    [say("fig.seasons"), data.seasons],
    [say("fig.games"), Math.round(data.franchises.reduce((a, t) => a + lineOf(t, phase).gp, 0) / 2)],
    [say("allTime.fig.titles"), data.franchises.reduce((a, t) => a + t.titles.length, 0)],
  ];

  const tableSection = (
    <section className="section">
      <h2>{say("allTime.table")}</h2>
      <div className="tablebox attable">
        <AllTimeTable lg={lg} head={tableHead} total={shownRows.length} phase={phase} active={!!active} initial={sort} flags={{ showT, showO, maxShare }} full={full} hrefAll={fullHref} label={say("allTime.title")} />
      </div>
    </section>
  );

  const shareBlock = (limit: number, titleKey: PhraseKey) => (
    <div>
      <h2>{say(titleKey)}</h2>
      <p className="note">{say("allTime.chart.shareNote", { n: MIN_SEASONS })}</p>
      {bars("share", limit, titleKey, 0.5)}
    </div>
  );
  const titlesBlock = (limit: number) => (
    <div>
      <h2>{say("allTime.chart.titles")}</h2>
      <p className="note">{say("allTime.chart.titlesNote")}</p>
      {bars("titles", limit, "allTime.chart.titles") ?? noChamps}
    </div>
  );

  return (
    <>
      <AccentStyle league={lg} />
      {head}
      {lede}
      {controls}
      <p className="note">{say(lg === "ncaaf" && phase === "r" ? "ncaaf.allTimeNote" : `allTime.note.${phase}`)} {say("allTime.note.common")}</p>
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
                  {bars("playoffs", 8, "allTime.chart.playoffs") ?? <p className="note">{say("chart.noResults")}</p>}
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
            <AllTimeChartLazy kind="scatter" lg={lg} phase={phase} active={!!active} rows={shownRows.length} first={data.first} last={data.last} />
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
            <AllTimeChartLazy kind="grid" lg={lg} phase={phase} active={!!active} rows={shownRows.length} first={data.first} last={data.last} />
          </section>
        </>
      ) : null}
    </>
  );
}
