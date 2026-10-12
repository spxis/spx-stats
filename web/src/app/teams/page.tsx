import type { Metadata } from "next";
import Link from "next/link";
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
import { getTeamPage, TEAM_SORTS, type TeamStatus } from "@/lib/teamIndex";
import { getPaths } from "@/lib/teamSlugs";
import type { TeamIndexRow } from "@/lib/api/teams";
import "@/components/alignment.css";

// Drawn per request (the language cookie and the filters); each page of teams the database sends is kept for an hour.

const DEF_SORT = "name.asc";
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const clean = (v: string) => v.trim().slice(0, 60);
const pageOf = (v: string) => (/^\d{1,4}$/.test(v) && Number(v) > 0 ? Number(v) : 1);
const statusOf = (v: string): TeamStatus => (v === "active" || v === "defunct" ? v : "all");
const STATUS_LABEL = { all: "teams.statusAll", active: "teams.statusActive", defunct: "teams.statusDefunct" } as const;

export const generateMetadata = guardMeta(async ({ searchParams }: PageProps<"/teams">): Promise<Metadata> => {
  const sp = await searchParams;
  const { say, locale } = await currentSpeaker();
  const plain = !searchWords(first(sp.q)).length && pageOf(first(sp.page)) === 1 && !first(sp.league) && !first(sp.sort) && statusOf(first(sp.status)) === "all";
  return { ...pageMeta({ title: say("teams.title"), description: say("teams.metaDesc"), path: "/teams", locale }), ...(plain ? {} : { robots: { index: false } }) };
});

export default guard(async function TeamsPage({ searchParams }: PageProps<"/teams">) {
  const sp = await searchParams;
  const { say, plural, fmt } = await currentSpeaker();
  const league = isLeague(first(sp.league)) ? first(sp.league) : "";
  const q = clean(first(sp.q));
  const status = statusOf(first(sp.status));
  const sort = parseSort(sp.sort, Object.keys(TEAM_SORTS), DEF_SORT).slice(0, 1);
  const sortText = formatSort(sort);
  const [data, paths, brands] = await Promise.all([getTeamPage(league, q, status, sort, pageOf(first(sp.page))).catch(() => null), getPaths(), getBrands()]);
  const keep = { league: league || null, q: q || null, status: status === "all" ? null : status, sort: sortText === DEF_SORT ? null : sortText };
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
    { key: "former", label: say("teams.colFormer"), get: (t: TeamIndexRow) => t.former_names.join(", ") },
  ], (t) => `${t.league}-${t.franchise_id}`) : null;

  return (
    <>
      <section className="head fade">
        <h1>{say("teams.title")}</h1>
        <p className="lede">{say("teams.lede")}</p>
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
          <SearchBox kind="teams" action="/teams" defaultValue={q} league={league} hidden={{ ...(league ? { league } : {}), ...(keep.status ? { status: keep.status } : {}), ...(keep.sort ? { sort: keep.sort } : {}) }} placeholder={say("teams.search")} buttonLabel={say("teams.searchGo")} />
        </div>
        {data == null || table == null ? <p className="note">{say("load.failed")}</p> : data.list.length ? (
          <>
            <p className="note">{plural("count.teams", data.total)}{data.pages > 1 ? ` · ${say("players.pageOf", { page: fmt(data.page), pages: fmt(data.pages) })}` : ""}</p>
            <div className="scroll"><SortTable {...table} def={DEF_SORT} initial={sort} remote /></div>
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
      </section>
    </>
  );
});
