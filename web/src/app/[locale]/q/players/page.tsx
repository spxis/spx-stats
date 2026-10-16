import type { Metadata } from "next";
import Link from "@/components/Link";
import { Flag } from "@/components/Flag";
import { NatLink } from "@/components/NatLink";
import { hasFlag } from "@/lib/flagCodes";
import { Credits } from "@/components/Credits";
import { LetterBar } from "@/components/LetterBar";
import { Pager } from "@/components/Pager";
import { CountryScope } from "@/components/CountryScope";
import { moreChips, PlayerCountries } from "@/components/PlayerCountries";
import { ListRange } from "@/components/ListRange";
import { SearchBox } from "@/components/SearchBox";
import { SortTable } from "@/components/SortTable";
import { positionBook } from "@/components/PositionKey";
import { queryHref } from "@/components/ViewTabs";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { Speaker } from "@/lib/i18n/i18n";
import { ListHeading } from "@/components/ListHeading";
import { listTitle, playersFilters } from "@/lib/listTitle";
import { isLeague, LEAGUES, LG } from "@/lib/leagues";
import { pageMeta } from "@/lib/meta";
import type { PlayerIndexRow } from "@/lib/api/people";
import { countryName, positionsText } from "@/lib/people-format";
import { readLetter } from "@/lib/listQuery";
import { getLetterCounts, getPlayerPage, PLAYER_SORTS, playerSpan, searchWords } from "@/lib/playerIndex";
import { getPlayerCountries, getReferenceCountries } from "@/lib/playerCountries";
import { coverage, referenceOf, type CountryFilters } from "@/lib/playerCountryModel";
import { getPlayerPaths } from "@/lib/playerLinks";
import { getPlayerTeams, playerTeamsReady } from "@/lib/playerTeams";
import { championshipCounts } from "@/lib/playerTitles";
import { split, stintLine } from "@/lib/playerTeamModel";
import { getBrands } from "@/lib/data";
import { logoFor } from "@/lib/brand";
import { getLeagueClubs, getPaths, getSlugs, teamOf } from "@/lib/teamSlugs";
import { PlayerTeamChips, TeamLogoList } from "@/components/PlayerTeamChips";
import { chipTuple, type TeamChip } from "@/lib/teamChips";
import { TeamPicker } from "@/components/TeamPicker";
import { formatSort, parseSort, tableOf, type ColumnSpec } from "@/lib/sort";
import { rangeFromQuery } from "@/lib/yearRange";
import "@/components/alignment.css";
import { guard, guardMeta } from "@/lib/loadGuard";

// Drawn for the request when the address has a query (lib/routing.ts); without one, s/players keeps this page and revalidates it every day. Each page of players the database sends is kept for a day.

const DEF_SORT = "name.asc";
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const clean = (v: string) => v.trim().slice(0, 60);
const pageOf = (v: string) => (/^\d{1,4}$/.test(v) && Number(v) > 0 ? Number(v) : 1);

/** The filters that narrow the list, said after the page word: the league, team and country (the team is a club's address, which belongs to its league). */
async function filtersOf(sp: Record<string, string | string[] | undefined>, { say, locale }: Speaker): Promise<string[]> {
  const asked = first(sp.league);
  const league = isLeague(asked) ? asked : "";
  const nat = /^[A-Za-z]{2}$/.test(first(sp.nat)) ? first(sp.nat).toUpperCase() : "";
  const hit = league && first(sp.team) && (await playerTeamsReady()) ? await teamOf(league, first(sp.team)) : null;
  const club = hit ? (await getSlugs()).leagues[league]?.clubs.get(hit.f)?.name : undefined;
  return playersFilters(say, { league: isLeague(league) ? LG[league] : null, team: club, country: nat ? countryName(nat, locale) : null });
}

export const generateMetadata = guardMeta(async ({ searchParams }: PageProps<"/[locale]/q/players">): Promise<Metadata> => {
  const sp = await searchParams;
  const speaker = await currentSpeaker();
  const { say, locale } = speaker;
  const plain = !searchWords(first(sp.q)).length && pageOf(first(sp.page)) === 1 && !first(sp.league) && !first(sp.team) && !first(sp.nat) && !first(sp.letter) && !first(sp.sort) && !first(sp.from) && !first(sp.to);
  return { ...pageMeta({ title: listTitle(say("players.title"), await filtersOf(sp, speaker)), description: say("players.metaDesc"), path: "/players", locale }), ...(plain ? {} : { robots: { index: false, follow: false } }) };
});

export default guard(async function PlayersPage({ searchParams }: PageProps<"/[locale]/q/players">) {
  const sp = await searchParams;
  const speaker = await currentSpeaker();
  const { say, plural, fmt, locale } = speaker;
  const filters = await filtersOf(sp, speaker);
  const player = await getPlayerPaths();
  const league = isLeague(first(sp.league)) ? first(sp.league) : "";
  const q = clean(first(sp.q));
  const nat = /^[A-Za-z]{2}$/.test(first(sp.nat)) ? first(sp.nat).toUpperCase() : "";
  const sort = parseSort(sp.sort, Object.keys(PLAYER_SORTS), DEF_SORT).slice(0, 1);
  const sortText = formatSort(sort);
  const span = await playerSpan(league).catch(() => null);
  const range = span ? rangeFromQuery(first(sp.from), first(sp.to), span.min, span.max) : null;
  // The first letter of the last name (or of the first name): it combines with every other choice, and the row of letters counts under those choices.
  const letter = readLetter(first(sp.letter)) ?? "";
  const letterBy = first(sp.letter_by) === "first" ? "first" : "last";
  // The team (a club's address, which belongs to its league): anyone who ever played for it. It waits for api.player_team_search (migration 098).
  const teamsOn = await playerTeamsReady();
  const paths = await getPaths();
  const teamHit = teamsOn && league && first(sp.team) ? await teamOf(league, first(sp.team)) : null;
  const team = teamHit?.f;
  const teamSlug = team !== undefined ? paths.slug(league, team) : "";
  const others = { ...(range ?? {}), ...(nat ? { nat } : {}), ...(team !== undefined ? { team } : {}), letterBy } as const;
  // The countries are counted under every choice but the country itself, so the chips and the map keep offering them all.
  const choices: CountryFilters = { league, words: searchWords(q), ...(range ?? {}), ...(letter ? { letter } : {}), ...(team !== undefined ? { team } : {}), letterBy };
  const refKind = referenceOf(choices);
  const [data, counts, countries, refTally] = await Promise.all([
    getPlayerPage(league, q, sort, pageOf(first(sp.page)), { ...others, ...(letter ? { letter } : {}) }).catch(() => null),
    getLetterCounts({ league, words: searchWords(q), ...others }),
    getPlayerCountries(choices),
    getReferenceCountries(choices),
  ]);
  // The Teams column: every player of the page's teams in one read; without the view there is no column.
  const [teams, brands, slugs, titles] = await Promise.all([
    teamsOn && data ? getPlayerTeams(data.list.map((p) => p.person_id)).catch(() => null) : null,
    teamsOn ? getBrands() : null,
    teamsOn ? getSlugs() : null,
    // The same career total as the player page. Not a field of the index, so the column is not a sort of the whole list.
    data ? championshipCounts(data.list.map((p) => p.person_id)) : null,
  ]);
  const keep = { league: league || null, team: teamSlug || null, nat: nat || null, q: q || null, letter: letter ? letter.toUpperCase() : null, letter_by: letterBy === "first" ? "first" : null, sort: sortText === DEF_SORT ? null : sortText, from: range ? String(range.from) : null, to: range ? String(range.to) : null };
  const href = (changes: Record<string, string | null>) => queryHref("/players", sp, { ...keep, page: null, ...changes });
  const to = (page: number) => href({ page: page > 1 ? String(page) : null });

  // The country column only draws once the database has `country` (migration 063); before that the rows carry none.
  const book = await positionBook();
  const withCountry =!!data?.list.some((p) => p.country !== undefined);
  // The picker's clubs: the league's, the ones still playing first, each by the address segment its page has.
  const pickable = teamsOn && league ? (await getLeagueClubs(league)).map((c) => ({ slug: paths.slug(league, c.f), name: c.name, active: c.active })) : [];
  // One player's teams as small logos, the earliest first: at most four, then "+N" (the name and the years of each are in its tooltip).
  const logoList: string[] = [];
  const chipsOf = (p: PlayerIndexRow) => {
    const items: TeamChip[] = (teams?.get(p.person_id) ?? []).flatMap((r) => {
      const lg = r.league && isLeague(r.league) ? r.league : p.leagues?.[0];
      const name = lg ? slugs?.leagues[lg]?.clubs.get(r.franchise_id)?.name : undefined;
      if (!lg || !name) return [];
      const own = logoFor(brands ?? {}, r.franchise_id, r.last_year);
      const logo = own ?? logoFor(brands ?? {}, r.franchise_id);
      return [{ key: String(r.franchise_id), href: paths.team(lg, r.franchise_id), name, logo, dim: !own && !!logo, tip: stintLine(name, r) }];
    });
    return items;
  };
  const table = data ? tableOf(data.list, [
    { key: "name", label: say("col.name"), cls: "team", rest: "name", get: (p: PlayerIndexRow) => p.name, cell: (p: PlayerIndexRow) => <Link href={player(p.person_id, p.name, p.leagues?.[0])} prefetch={false}>{p.name}</Link> },
    { key: "league", label: say("col.league"), rest: "leagues", get: (p: PlayerIndexRow) => (p.leagues ?? []).map((l) => (isLeague(l) ? LG[l] : l)).join(", ") },
    // The league filter, when there is one, reads a code first (C is a centre in the NHL, a catcher in MLB); otherwise the player's own leagues in order.
    { key: "position", label: say("player.factPosition"), rest: "position", get: (p: PlayerIndexRow) => positionsText(p.positions, p.position), cell: (p: PlayerIndexRow) => book.list(p.positions, p.position, [...(league ? [league] : []), ...(p.leagues ?? [])]) },
    ...(teams ? [{
      key: "teams", label: say("players.teamsCol"), title: say("players.teamsTitle"), cls: "nowrap", get: (p: PlayerIndexRow) => chipsOf(p).length,
      cell: (p: PlayerIndexRow) => {
        const { shown, more } = split(chipsOf(p));
        return <PlayerTeamChips shown={shown.map((t) => chipTuple(t, logoList))} more={more.map((t) => t.tip)} />;
      },
    } satisfies ColumnSpec<PlayerIndexRow>] : []),
    ...(withCountry ? [{
      key: "country", label: say("players.colCountry"), title: say("players.countryTitle"), get: (p: PlayerIndexRow) => (p.country ? countryName(p.country, locale) : ""),
      cell: (p: PlayerIndexRow) => (p.country ? <NatLink href={href({ nat: p.country.toUpperCase() })} title={say("players.byCountry", { name: countryName(p.country, locale) })} code={hasFlag(p.country) ? p.country : null} /> : null),
    } satisfies ColumnSpec<PlayerIndexRow>] : []),
    { key: "years", label: say("col.years"), cls: "nowrap", title: say("players.yearsTitle"), rest: "last_season", get: (p: PlayerIndexRow) => p.last_season, cell: (p: PlayerIndexRow) => (p.first_season == null ? "" : p.last_season != null && p.last_season !== p.first_season ? `${p.first_season}–${p.last_season}` : String(p.first_season)) },
    { key: "seasons", label: say("players.colSeasons"), num: true, rest: "seasons_played", get: (p: PlayerIndexRow) => p.seasons_played, cell: (p: PlayerIndexRow) => fmt(p.seasons_played) },
    { key: "awards", label: say("players.colAwards"), num: true, rest: "award_count", get: (p: PlayerIndexRow) => p.award_count, cell: (p: PlayerIndexRow) => fmt(p.award_count) },
    ...(titles ? [{
      key: "titles", label: say("titles.col"), title: say("titles.career"), num: true, nosort: true,
      get: (p: PlayerIndexRow) => titles.get(p.person_id) ?? 0, cell: (p: PlayerIndexRow) => fmt(titles.get(p.person_id) ?? 0),
    } satisfies ColumnSpec<PlayerIndexRow>] : []),
  ], (p) => p.person_id) : null;

  // The country filter is a row of chips among the other filters; the donut and the map are a small strip under the list. They share one scope, so a country
  // pointed at or chosen is lit in both. Without the chips (the country is known for too few players) a chosen country still needs a line to say so.
  const chipsShown = !!countries && coverage(countries) !== "none";
  const reference = refKind && refTally ? { kind: refKind, tally: refTally } : null;
  const body = (
    <>
      <div className="pfilters">
        <div className="controls">
          <nav className="seg views" aria-label={say("players.leagueAria")}>
            {[{ code: "", short: say("phase.all") }, ...LEAGUES].map((l) => (
              <Link key={l.code} href={href({ league: l.code || null, team: null })} prefetch={false} aria-current={l.code === league ? "page" : undefined}>{l.short}</Link>
            ))}
          </nav>
          {teamsOn && league ? <TeamPicker action="/players" value={teamSlug} clubs={pickable} hidden={{ league, ...(nat ? { nat } : {}), ...(keep.letter ? { letter: keep.letter } : {}), ...(keep.letter_by ? { letter_by: keep.letter_by } : {}), ...(keep.sort ? { sort: keep.sort } : {}), ...(keep.from ? { from: keep.from, to: keep.to ?? "" } : {}), ...(q ? { q } : {}) }} /> : null}
          <SearchBox kind="players" action="/players" defaultValue={q} league={league} hidden={{ ...(league ? { league } : {}), ...(teamSlug ? { team: teamSlug } : {}), ...(nat ? { nat } : {}), ...(keep.letter ? { letter: keep.letter } : {}), ...(keep.letter_by ? { letter_by: keep.letter_by } : {}), ...(keep.sort ? { sort: keep.sort } : {}), ...(keep.from ? { from: keep.from, to: keep.to ?? "" } : {}) }} placeholder={say("players.search")} buttonLabel={say("players.searchGo")} />
        </div>
        <LetterBar say={say} plural={plural} letter={letter} by={letterBy} counts={counts} href={href} />
        {countries ? <PlayerCountries part="chips" t={countries} reference={reference} league={league} chosen={nat} href={href} /> : null}
        {nat && !chipsShown ? <p className="note"><Flag code={nat} shape="round" /> {say("players.countryOnly", { name: countryName(nat, locale) })} · <Link href={href({ nat: null })} prefetch={false}>{say("players.countryClear")}</Link></p> : null}
        {span ? <ListRange page="/players" min={span.min} max={span.max} from={range?.from ?? span.min} to={range?.to ?? span.max} inAddress={/^\d{1,4}$/.test(first(sp.from)) || /^\d{1,4}$/.test(first(sp.to))} /> : null}
      </div>
      <div className="yr-hold">
        {data == null || table == null ? <p className="note">{say("load.failed")}</p> : data.list.length ? (
          <>
            <p className="note">{plural("count.players", data.total)}{data.pages > 1 ? ` · ${say("players.pageOf", { page: fmt(data.page), pages: fmt(data.pages) })}` : ""}</p>
            <div className="scroll"><TeamLogoList logos={logoList}><SortTable {...table} def={DEF_SORT} initial={sort} remote /></TeamLogoList></div>
            <Pager page={data.page} pages={data.pages} href={to} label={say("players.pager")} say={say} fmt={fmt} />
            {countries ? <PlayerCountries part="strip" t={countries} reference={reference} league={league} chosen={nat} href={href} /> : null}
            {book.key()}
            <p className="note small"><Credits say={say} use={["flags"]} /></p>
          </>
        ) : <p className="note">{say("players.none")}</p>}
      </div>
    </>
  );

  return (
    <>
      <section className="head fade tight">
        <ListHeading say={say} head={say("players.title")} filters={filters} />
        <p className="lede">{say("players.lede")}</p>
      </section>
      <section className="section plist">
        {chipsShown ? <CountryScope chosen={nat} more={moreChips(countries!, nat) > 0}>{body}</CountryScope> : body}
      </section>
    </>
  );
});
