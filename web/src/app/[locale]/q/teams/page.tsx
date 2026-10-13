import type { Metadata } from "next";
import Link from "next/link";
import { ListRange } from "@/components/ListRange";
import { SearchBox } from "@/components/SearchBox";
import { SortTable } from "@/components/SortTable";
import { TeamLogo } from "@/components/TeamLogo";
import { queryHref } from "@/components/ViewTabs";
import { logoFor } from "@/lib/brand";
import { getBrands } from "@/lib/data";
import { fmt3 } from "@/lib/format";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, LEAGUES, LG } from "@/lib/leagues";
import { searchWords } from "@/lib/listQuery";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { formatSort, parseSort, tableOf } from "@/lib/sort";
import { getTeamPage, TEAM_SORTS, teamSpan, type TeamStatus } from "@/lib/teamIndex";
import { getPaths } from "@/lib/teamSlugs";
import { rangeFromQuery } from "@/lib/yearRange";
import type { TeamIndexRow } from "@/lib/api/teams";
import "@/components/alignment.css";

// Drawn for the request when the address has a query (lib/routing.ts); without one, s/teams keeps this page and revalidates it every hour. Each page of teams the database sends is kept for an hour.

const DEF_SORT = "name.asc";
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const clean = (v: string) => v.trim().slice(0, 60);
const pageOf = (v: string) => (/^\d{1,4}$/.test(v) && Number(v) > 0 ? Number(v) : 1);
const statusOf = (v: string): TeamStatus => (v === "active" || v === "defunct" ? v : "all");
const STATUS_LABEL = { all: "teams.statusAll", active: "teams.statusActive", defunct: "teams.statusDefunct" } as const;

export const generateMetadata = guardMeta(async ({ searchParams }: PageProps<"/[locale]/q/teams">): Promise<Metadata> => {
  const sp = await searchParams;
  const { say, locale } = await currentSpeaker();
  const plain = !searchWords(first(sp.q)).length && pageOf(first(sp.page)) === 1 && !first(sp.league) && !first(sp.sort) && statusOf(first(sp.status)) === "all" && !first(sp.from) && !first(sp.to);
  return { ...pageMeta({ title: say("teams.title"), description: say("teams.metaDesc"), path: "/teams", locale }), ...(plain ? {} : { robots: { index: false } }) };
});

export default guard(async function TeamsPage({ searchParams }: PageProps<"/[locale]/q/teams">) {
  const sp = await searchParams;
  const { say, plural, fmt } = await currentSpeaker();
  const league = isLeague(first(sp.league)) ? first(sp.league) : "";
  const q = clean(first(sp.q));
  const status = statusOf(first(sp.status));
  const sort = parseSort(sp.sort, Object.keys(TEAM_SORTS), DEF_SORT).slice(0, 1);
  const sortText = formatSort(sort);
  const span = await teamSpan(league).catch(() => null);
  const range = span ? rangeFromQuery(first(sp.from), first(sp.to), span.min, span.max) : null;
  const [data, paths, brands] = await Promise.all([getTeamPage(league, q, status, sort, pageOf(first(sp.page)), range ?? {}).catch(() => null), getPaths(), getBrands()]);
  const keep = { league: league || null, q: q || null, status: status === "all" ? null : status, sort: sortText === DEF_SORT ? null : sortText, from: range ? String(range.from) : null, to: range ? String(range.to) : null };
  const href = (changes: Record<string, string | null>) => queryHref("/teams", sp, { ...keep, page: null, ...changes });
  const to = (page: number) => href({ page: page > 1 ? String(page) : null });

  const table = data ? tableOf(data.list, [
    {
      key: "name", label: say("col.team"), cls: "team", rest: "name", get: (t: TeamIndexRow) => t.name,
      cell: (t: TeamIndexRow) => (
        <Link href={paths.team(t.league, t.franchise_id)} prefetch={false}>
          <TeamLogo url={logoFor(brands, t.franchise_id)} size={22} shape="square" />{t.name}
        </Link>
      ),
    },
    { key: "league", label: say("col.league"), rest: "league", get: (t: TeamIndexRow) => (isLeague(t.league) ? LG[t.league] : t.league) },
    { key: "first", label: say("col.from"), num: true, rest: "first_season", get: (t: TeamIndexRow) => t.first_season, cell: (t: TeamIndexRow) => (t.first_season == null ? "" : String(t.first_season)) },
    { key: "last", label: say("col.to"), num: true, rest: "last_season", get: (t: TeamIndexRow) => t.last_season, cell: (t: TeamIndexRow) => (t.last_season == null ? "" : t.active ? say("teams.now") : String(t.last_season)) },
    { key: "seasons", label: say("col.seasons"), num: true, rest: "seasons", get: (t: TeamIndexRow) => t.seasons, cell: (t: TeamIndexRow) => fmt(t.seasons) },
    { key: "titles", label: say("col.titles"), num: true, rest: "titles", get: (t: TeamIndexRow) => t.titles, cell: (t: TeamIndexRow) => fmt(t.titles) },
    { key: "share", label: say("teams.colShare"), num: true, title: say("teams.shareTitle"), rest: "share", get: (t: TeamIndexRow) => t.share, cell: (t: TeamIndexRow) => (t.share == null ? "" : fmt3(t.share)) },
    { key: "former", label: say("teams.colFormer"), cls: "former", get: (t: TeamIndexRow) => t.former_names.join(", "), cell: (t: TeamIndexRow) => { const names = t.former_names.join(", "); return <span title={names}>{names}</span>; } },
  ], (t) => `${t.league}-${t.franchise_id}`) : null;

  return (
    <>
      <section className="head fade">
        <h1>{say("teams.title")}</h1>
        <p className="lede">{say("teams.lede")}</p>
        <p className="note"><Link href="/teams/lineage" prefetch={false}>{say("lineage.link")}</Link> · <Link href="/teams/coaches" prefetch={false}>{say("coaches.link")}</Link></p>
      </section>
      <section className="section">
        <div className="controls">
          <nav className="seg views" aria-label={say("teams.leagueAria")}>
            {[{ code: "", short: say("phase.all") }, ...LEAGUES].map((l) => (
              <Link key={l.code} href={href({ league: l.code || null })} prefetch={false} aria-current={l.code === league ? "page" : undefined}>{l.short}</Link>
            ))}
          </nav>
          <nav className="seg views" aria-label={say("teams.statusAria")}>
            {(["all", "active", "defunct"] as const).map((s) => (
              <Link key={s} href={href({ status: s === "all" ? null : s })} prefetch={false} aria-current={s === status ? "page" : undefined}>{say(STATUS_LABEL[s])}</Link>
            ))}
          </nav>
          <SearchBox kind="teams" action="/teams" defaultValue={q} league={league} hidden={{ ...(league ? { league } : {}), ...(keep.status ? { status: keep.status } : {}), ...(keep.sort ? { sort: keep.sort } : {}), ...(keep.from ? { from: keep.from, to: keep.to ?? "" } : {}) }} placeholder={say("teams.search")} buttonLabel={say("teams.searchGo")} />
        </div>
        {span ? <ListRange page="/teams" min={span.min} max={span.max} from={range?.from ?? span.min} to={range?.to ?? span.max} inAddress={/^\d{1,4}$/.test(first(sp.from)) || /^\d{1,4}$/.test(first(sp.to))} /> : null}
        <div className="yr-hold">
        {data == null || table == null ? <p className="note">{say("load.failed")}</p> : data.list.length ? (
          <>
            <p className="note">{plural("count.teams", data.total)}{data.pages > 1 ? ` · ${say("players.pageOf", { page: fmt(data.page), pages: fmt(data.pages) })}` : ""}</p>
            <div className="scroll teamlist"><SortTable {...table} def={DEF_SORT} initial={sort} remote /></div>
            {data.pages > 1 ? (
              <nav className="pager" aria-label={say("teams.pager")}>
                {data.page > 1 ? <Link href={to(1)} prefetch={false}>{"« " + say("players.first")}</Link> : null}
                {data.page > 1 ? <Link href={to(data.page - 1)} prefetch={false} rel="prev">{"‹ " + say("players.prev")}</Link> : null}
                <b>{say("players.pageOf", { page: fmt(data.page), pages: fmt(data.pages) })}</b>
                {data.page < data.pages ? <Link href={to(data.page + 1)} prefetch={false} rel="next">{say("players.next") + " ›"}</Link> : null}
                {data.page < data.pages ? <Link href={to(data.pages)} prefetch={false}>{say("players.last") + " »"}</Link> : null}
              </nav>
            ) : null}
          </>
        ) : <p className="note">{say("teams.none")}</p>}
        </div>
      </section>
    </>
  );
});
