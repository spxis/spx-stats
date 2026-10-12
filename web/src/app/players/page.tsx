import type { Metadata } from "next";
import Link from "next/link";
import { SortTable } from "@/components/SortTable";
import { queryHref } from "@/components/ViewTabs";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, LEAGUES, LG } from "@/lib/leagues";
import { pageMeta } from "@/lib/meta";
import type { PlayerIndexRow } from "@/lib/api/people";
import { capFirst } from "@/lib/people-format";
import { getPlayerPage, PLAYER_SORTS, searchWords } from "@/lib/playerIndex";
import { getPlayerPaths } from "@/lib/playerLinks";
import { formatSort, parseSort, tableOf } from "@/lib/sort";
import "@/components/alignment.css";
import { guard, guardMeta } from "@/lib/loadGuard";

// Drawn per request (the language cookie and the filters); each page of players the database sends is kept for an hour.

const DEF_SORT = "name.asc";
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const clean = (v: string) => searchWords(v).join(" ");
const pageOf = (v: string) => (/^\d{1,4}$/.test(v) && Number(v) > 0 ? Number(v) : 1);

export const generateMetadata = guardMeta(async ({ searchParams }: PageProps<"/players">): Promise<Metadata> => {
  const sp = await searchParams;
  const { say, locale } = await currentSpeaker();
  const plain = !clean(first(sp.q)) && pageOf(first(sp.page)) === 1 && !first(sp.league) && !first(sp.sort);
  return { ...pageMeta({ title: say("players.title"), description: say("players.metaDesc"), path: "/players", locale }), ...(plain ? {} : { robots: { index: false } }) };
});

export default guard(async function PlayersPage({ searchParams }: PageProps<"/players">) {
  const sp = await searchParams;
  const { say, plural, fmt } = await currentSpeaker();
  const player = await getPlayerPaths();
  const league = isLeague(first(sp.league)) ? first(sp.league) : "";
  const q = clean(first(sp.q));
  const sort = parseSort(sp.sort, Object.keys(PLAYER_SORTS), DEF_SORT).slice(0, 1);
  const sortText = formatSort(sort);
  const data = await getPlayerPage(league, q, sort, pageOf(first(sp.page))).catch(() => null);
  const keep = { league: league || null, q: q || null, sort: sortText === DEF_SORT ? null : sortText };
  const href = (changes: Record<string, string | null>) => queryHref("/players", sp, { ...keep, page: null, ...changes });
  const to = (page: number) => href({ page: page > 1 ? String(page) : null });

  const table = data ? tableOf(data.list, [
    { key: "name", label: say("col.name"), cls: "team", rest: "name", get: (p: PlayerIndexRow) => p.name, cell: (p: PlayerIndexRow) => <Link href={player(p.person_id, p.name, p.leagues?.[0])} prefetch={false}>{p.name}</Link> },
    { key: "league", label: say("col.league"), rest: "leagues", get: (p: PlayerIndexRow) => (p.leagues ?? []).map((l) => (isLeague(l) ? LG[l] : l)).join(", ") },
    { key: "position", label: say("player.factPosition"), rest: "position", get: (p: PlayerIndexRow) => (p.position ? capFirst(p.position) : "") },
    { key: "years", label: say("col.years"), cls: "nowrap", title: say("players.yearsTitle"), rest: "last_season", get: (p: PlayerIndexRow) => p.last_season, cell: (p: PlayerIndexRow) => (p.first_season == null ? "" : p.last_season != null && p.last_season !== p.first_season ? `${p.first_season}–${p.last_season}` : String(p.first_season)) },
    { key: "seasons", label: say("players.colSeasons"), num: true, rest: "seasons_played", get: (p: PlayerIndexRow) => p.seasons_played, cell: (p: PlayerIndexRow) => fmt(p.seasons_played) },
    { key: "awards", label: say("players.colAwards"), num: true, rest: "award_count", get: (p: PlayerIndexRow) => p.award_count, cell: (p: PlayerIndexRow) => fmt(p.award_count) },
  ], (p) => p.person_id) : null;

  return (
    <>
      <section className="head fade">
        <h1>{say("players.title")}</h1>
        <p className="lede">{say("players.lede")}</p>
      </section>
      <section className="section">
        <div className="controls">
          <nav className="seg views" aria-label={say("players.leagueAria")}>
            {[{ code: "", short: say("phase.all") }, ...LEAGUES].map((l) => (
              <Link key={l.code} href={href({ league: l.code || null })} prefetch={false} aria-current={l.code === league ? "page" : undefined}>{l.short}</Link>
            ))}
          </nav>
          <form action="/players" method="get" role="search" className="controls">
            {league ? <input type="hidden" name="league" value={league} /> : null}
            {keep.sort ? <input type="hidden" name="sort" value={keep.sort} /> : null}
            <input type="search" name="q" defaultValue={q} placeholder={say("players.search")} aria-label={say("players.search")} maxLength={60} />
            <button type="submit">{say("players.searchGo")}</button>
          </form>
        </div>
        {data == null || table == null ? <p className="note">{say("load.failed")}</p> : data.list.length ? (
          <>
            <p className="note">{plural("count.players", data.total)}{data.pages > 1 ? ` · ${say("players.pageOf", { page: fmt(data.page), pages: fmt(data.pages) })}` : ""}</p>
            <div className="scroll"><SortTable {...table} def={DEF_SORT} initial={sort} remote /></div>
            {data.pages > 1 ? (
              <nav className="pager" aria-label={say("players.pager")}>
                {data.page > 1 ? <Link href={to(1)} prefetch={false}>{"« " + say("players.first")}</Link> : null}
                {data.page > 1 ? <Link href={to(data.page - 1)} prefetch={false} rel="prev">{"‹ " + say("players.prev")}</Link> : null}
                <b>{say("players.pageOf", { page: fmt(data.page), pages: fmt(data.pages) })}</b>
                {data.page < data.pages ? <Link href={to(data.page + 1)} prefetch={false} rel="next">{say("players.next") + " ›"}</Link> : null}
                {data.page < data.pages ? <Link href={to(data.pages)} prefetch={false}>{say("players.last") + " »"}</Link> : null}
              </nav>
            ) : null}
          </>
        ) : <p className="note">{say("players.none")}</p>}
      </section>
    </>
  );
});
