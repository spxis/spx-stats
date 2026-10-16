import type { Metadata } from "next";
import Link from "@/components/Link";
import { ChipsMore } from "@/components/ChipsMore";
import { ListHeading } from "@/components/ListHeading";
import { NatLink } from "@/components/NatLink";
import { Pager } from "@/components/Pager";
import { CHIPS_SHOWN } from "@/components/PlayerCountries";
import { PlayersFilterBar } from "@/components/PlayersFilterBar";
import { SegChips } from "@/components/SegChips";
import { SortTable } from "@/components/SortTable";
import { queryHref } from "@/components/ViewTabs";
import { requireAdmin } from "@/lib/auth/user";
import { hasFlag } from "@/lib/flagCodes";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { parsePeopleSearch, PEOPLE_SORTS, peopleCountries, peopleLetterCounts, peopleSources, peopleSpan, peopleSports, searchPeople, type PersonAdminRow } from "@/lib/adminPeople";
import { countryName } from "@/lib/people-format";
import { chipSplit } from "@/lib/playerCountryModel";
import { playerPath } from "@/lib/playerPath";
import { formatSort, parseSort, tableOf, type ColumnSpec } from "@/lib/sort";
import { rangeFromQuery } from "@/lib/yearRange";
import { PeopleTabs } from "./PeopleTabs";

/**
 * Every core.person, including athletes with no club season. Admin only, drawn per request.
 * The filter bar is the same module /players uses. Anyone else gets a 404. Never cached.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const metadata: Metadata = { title: "People", robots: { index: false, follow: false } };

type Query = Record<string, string | string[] | undefined>;

const DEF_SORT = "name.asc";
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const dash = <span className="note">–</span>;

function years(from: number | null, to: number | null): string | null {
  if (from == null) return null;
  return to == null || to === from ? String(from) : `${from}–${to}`;
}

export default async function AdminPeopleSearchPage({ searchParams }: { searchParams: Promise<Query> }) {
  await requireAdmin();
  const query = await searchParams;
  const { say, plural, fmt, locale } = await currentSpeaker();
  const parsed = parsePeopleSearch(query);
  const q = first(query.q).trim().slice(0, 60);
  const league = parsed.league ?? "";
  const nat = parsed.country ?? "";
  const letter = parsed.letter ?? "";
  const letterBy = parsed.letterBy ?? "last";
  const sport = parsed.sport ?? "";
  const seasons = parsed.seasons ?? "";
  const source = parsed.source ?? "";
  const sort = parseSort(query.sort, Object.keys(PEOPLE_SORTS), DEF_SORT).slice(0, 1);
  const sortText = formatSort(sort);
  const [result, span, countries, sports, sources, counts] = await Promise.all([
    searchPeople(parsed, parsed.page, sort),
    peopleSpan(),
    peopleCountries(),
    peopleSports(),
    peopleSources(),
    peopleLetterCounts(letterBy),
  ]);
  const range = span ? rangeFromQuery(first(query.from), first(query.to), span.min, span.max) : null;
  const keep = {
    league: league || null,
    sport: sport || null,
    nat: nat || null,
    q: q || null,
    letter: letter ? letter.toUpperCase() : null,
    letter_by: letterBy === "first" ? "first" : null,
    sort: sortText === DEF_SORT ? null : sortText,
    from: range ? String(range.from) : null,
    to: range ? String(range.to) : null,
    seasons: seasons || null,
    source: source || null,
    after: null,
  };
  const href = (changes: Record<string, string | null>) => queryHref("/admin/people", query, { ...keep, page: null, ...changes });
  const to = (page: number) => href({ page: page > 1 ? String(page) : null });
  const sportLabel = (code: string) => code.replaceAll("_", " ");
  const sportSplit = sports?.length ? chipSplit(sports, sport, CHIPS_SHOWN) : null;
  const sportChips = sportSplit
    ? [{ code: "", short: say("phase.all") }, ...sportSplit.shown.map((s) => ({ code: s.code, short: sportLabel(s.code) }))]
    : [];
  const sportMore = sportSplit?.more.map((s) => ({ code: s.code, short: sportLabel(s.code) })) ?? [];
  const sourceChips = sources?.length
    ? [{ code: "", short: say("phase.all") }, ...sources.map((s) => ({ code: s.code, short: s.code.replaceAll("_", " ") }))]
    : [];
  const seasonChips = [
    { code: "", short: say("phase.all") },
    { code: "yes", short: say("peopleAdmin.seasons.yesChip") },
    { code: "no", short: say("peopleAdmin.seasons.noChip") },
  ];
  const filters = [
    league ? league.toUpperCase() : "",
    sport,
    nat ? countryName(nat, locale) : "",
    seasons ? (seasons === "yes" ? say("peopleAdmin.seasons.yes") : say("peopleAdmin.seasons.no")) : "",
    source,
  ].filter(Boolean);
  const table = result.kind === "ok" ? tableOf(result.rows, [
    {
      key: "name", label: say("col.name"), cls: "team", rest: "name", get: (p: PersonAdminRow) => p.name,
      cell: (p: PersonAdminRow) => {
        const lg = p.leagues?.find(Boolean) ?? null;
        const player = lg ? playerPath(lg, p.person_id, p.name) : null;
        return (
          <div>
            {player ? <Link href={player} prefetch={false}>{p.name}</Link> : <strong>{p.name}</strong>}
            <div className="note">#{p.person_id}{p.kind !== "player" ? `, ${p.kind}` : ""}</div>
          </div>
        );
      },
    },
    { key: "sports", label: say("peopleAdmin.sport.aria"), rest: "sports", get: (p: PersonAdminRow) => p.sports[0] ?? "", cell: (p: PersonAdminRow) => (p.sports.length ? p.sports.join(", ") : dash) },
    {
      key: "country", label: say("players.colCountry"), title: say("players.countryTitle"), rest: "country",
      get: (p: PersonAdminRow) => (p.country ? countryName(p.country, locale) : ""),
      cell: (p: PersonAdminRow) => (p.country ? <NatLink href={href({ nat: p.country.toUpperCase() })} title={say("players.byCountry", { name: countryName(p.country, locale) })} code={hasFlag(p.country) ? p.country : null} /> : null),
    },
    {
      key: "born", label: say("col.years"), cls: "nowrap", rest: "birth_year", get: (p: PersonAdminRow) => p.birth_year,
      cell: (p: PersonAdminRow) => {
        const born = p.birth_date ?? (p.birth_year != null ? String(p.birth_year) : null);
        const died = p.death_date ?? (p.death_year != null ? String(p.death_year) : null);
        const life = born ? (died ? `${born} – ${died}` : born) : null;
        return life ? <span className="note">{life}</span> : dash;
      },
    },
    { key: "leagues", label: say("col.league"), rest: "leagues", get: (p: PersonAdminRow) => p.leagues?.[0] ?? "", cell: (p: PersonAdminRow) => (p.leagues?.length ? p.leagues.join(", ").toUpperCase() : dash) },
    {
      key: "seasons", label: say("players.colSeasons"), num: true, rest: "seasons_played", get: (p: PersonAdminRow) => p.seasons_played,
      cell: (p: PersonAdminRow) => (p.has_seasons ? (years(p.first_season, p.last_season) ?? p.seasons_played) : dash),
    },
    { key: "qid", label: "QID", rest: "qid", get: (p: PersonAdminRow) => p.qid ?? "", cell: (p: PersonAdminRow) => (p.qid ? <a href={`https://www.wikidata.org/wiki/${p.qid}`} rel="noreferrer">{p.qid}</a> : dash) },
    { key: "sources", label: say("peopleAdmin.source.aria"), rest: "sources", get: (p: PersonAdminRow) => p.sources[0] ?? "", cell: (p: PersonAdminRow) => (p.sources.length ? <span className="note">{p.sources.join(", ")}</span> : dash) },
  ] satisfies ColumnSpec<PersonAdminRow>[], (p) => p.person_id) : null;

  return (
    <>
      <section className="head fade tight">
        <ListHeading say={say} head={say("peopleAdmin.title")} filters={filters} />
        <p className="lede">{say("peopleAdmin.lede")}</p>
        <PeopleTabs current="search" />
      </section>
      <section className="section plist">
        <PlayersFilterBar
          path="/admin/people"
          href={href}
          league={league}
          q={q}
          nat={nat}
          letter={letter}
          letterBy={letterBy}
          counts={counts}
          countries={countries}
          span={span}
          range={range}
          inAddress={/^\d{1,4}$/.test(first(query.from)) || /^\d{1,4}$/.test(first(query.to))}
          searchHidden={{
            ...(league ? { league } : {}),
            ...(sport ? { sport } : {}),
            ...(nat ? { nat } : {}),
            ...(letter ? { letter: letter.toUpperCase() } : {}),
            ...(letterBy === "first" ? { letter_by: "first" } : {}),
            ...(sortText !== DEF_SORT ? { sort: sortText } : {}),
            ...(range ? { from: String(range.from), to: String(range.to) } : {}),
            ...(seasons ? { seasons } : {}),
            ...(source ? { source } : {}),
          }}
          extra={
            <>
              {sportChips.length ? (
                <div className="pfilters-sportrow">
                  <SegChips aria={say("peopleAdmin.sportsAria")} current={sport} items={sportChips} href={(code) => href({ sport: code || null })} />
                  {sportMore.length ? (
                    <ChipsMore label={say("peopleAdmin.sportsMore", { n: fmt(sportMore.length) })}>
                      {sportMore.map((item) => (
                        <Link key={item.code} href={href({ sport: item.code })} prefetch={false} aria-current={item.code === sport ? "page" : undefined}>{item.short}</Link>
                      ))}
                    </ChipsMore>
                  ) : null}
                </div>
              ) : null}
              <SegChips aria={say("peopleAdmin.seasons.aria")} current={seasons} items={seasonChips} href={(code) => href({ seasons: code || null })} />
              {sourceChips.length ? <SegChips aria={say("peopleAdmin.sourcesAria")} current={source} items={sourceChips} href={(code) => href({ source: code || null })} /> : null}
            </>
          }
        />
        <div className="yr-hold">
          {result.kind === "error" ? <p className="note" role="alert">{say("peopleAdmin.error", { reason: result.message })}</p> : null}
          {result.kind === "ok" && table ? (
            <>
              {result.fallback ? <p className="note">{say("peopleAdmin.fallback")}</p> : null}
              {result.rows.length ? (
                <>
                  {result.total != null ? (
                    <p className="note">{plural("count.players", result.total)}{result.pages > 1 ? ` · ${say("players.pageOf", { page: fmt(result.page), pages: fmt(result.pages) })}` : ""}</p>
                  ) : null}
                  <div className="scroll"><SortTable {...table} def={DEF_SORT} initial={sort} remote /></div>
                  {result.keyed
                    ? (result.next ? <p className="note"><Link href={href({ after: result.next })} prefetch={false}>{say("peopleAdmin.next")}</Link></p> : null)
                    : <Pager page={result.page} pages={result.pages} href={to} label={say("peopleAdmin.pager")} say={say} fmt={fmt} />}
                </>
              ) : <p className="note">{say("peopleAdmin.none")}</p>}
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}
