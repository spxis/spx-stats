import type { Metadata } from "next";
import Link from "next/link";
import { SortTable } from "@/components/SortTable";
import { requireAdmin } from "@/lib/auth/user";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { parsePeopleSearch, searchPeople, type PersonAdminRow } from "@/lib/adminPeople";
import { playerPath } from "@/lib/playerPath";
import type { SortColumn, SortRow } from "@/lib/sort";
import { PeopleTabs } from "./PeopleTabs";

/**
 * Search every core.person, including athletes with no club season. Admin only, drawn per request,
 * one query per search. Anyone else gets a 404. Never cached. In the reader's language.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const metadata: Metadata = { title: "People", robots: { index: false, follow: false } };

type Query = Record<string, string | string[] | undefined>;

const COLUMNS: SortColumn[] = [
  { key: "name", label: "Name" },
  { key: "sports", label: "Sports" },
  { key: "country", label: "Country" },
  { key: "born", label: "Born", cls: "nowrap" },
  { key: "leagues", label: "Leagues" },
  { key: "seasons", label: "Club seasons", num: true },
  { key: "qid", label: "QID" },
  { key: "sources", label: "Sources" },
];

const dash = <span className="note">–</span>;

function years(from: number | null, to: number | null): string | null {
  if (from == null) return null;
  return to == null || to === from ? String(from) : `${from}–${to}`;
}

function hrefOf(next: Record<string, string | number | undefined | null>, base: Query): string {
  const params = new URLSearchParams();
  const merged: Record<string, string | string[] | undefined> = { ...base };
  for (const [k, v] of Object.entries(next)) {
    if (v == null || v === "") delete merged[k];
    else merged[k] = String(v);
  }
  for (const [k, v] of Object.entries(merged)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val) params.set(k, val);
  }
  params.delete("page");
  if (next.page && Number(next.page) > 1) params.set("page", String(next.page));
  const qs = params.toString();
  return qs ? `/admin/people?${qs}` : "/admin/people";
}

function rowOf(p: PersonAdminRow): SortRow {
  const league = p.leagues?.find(Boolean) ?? null;
  const player = league ? playerPath(league, p.person_id, p.name) : null;
  const born = p.birth_date ?? (p.birth_year != null ? String(p.birth_year) : null);
  const died = p.death_date ?? (p.death_year != null ? String(p.death_year) : null);
  const life = born ? (died ? `${born} – ${died}` : born) : null;
  return {
    id: String(p.person_id),
    sort: { name: p.name.toLowerCase(), sports: (p.sports[0] ?? ""), country: p.country ?? "", born: p.birth_date ?? "", leagues: p.leagues?.[0] ?? "", seasons: p.seasons_played, qid: p.qid ?? "", sources: p.sources[0] ?? "" },
    cells: {
      name: (
        <div>
          {player ? <Link href={player}>{p.name}</Link> : <strong>{p.name}</strong>}
          <div className="note">#{p.person_id}{p.kind !== "player" ? `, ${p.kind}` : ""}</div>
        </div>
      ),
      sports: p.sports.length ? p.sports.join(", ") : dash,
      country: p.country ?? dash,
      born: life ? <span className="note">{life}</span> : dash,
      leagues: p.leagues?.length ? p.leagues.join(", ").toUpperCase() : dash,
      seasons: p.has_seasons ? (years(p.first_season, p.last_season) ?? p.seasons_played) : dash,
      qid: p.qid ? <a href={`https://www.wikidata.org/wiki/${p.qid}`} rel="noreferrer">{p.qid}</a> : dash,
      sources: p.sources.length ? <span className="note">{p.sources.join(", ")}</span> : dash,
    },
  };
}

export default async function AdminPeopleSearchPage({ searchParams }: { searchParams: Promise<Query> }) {
  await requireAdmin();
  const query = await searchParams;
  const { say } = await currentSpeaker();
  const parsed = parsePeopleSearch(query);
  const q = Array.isArray(query.q) ? query.q[0] ?? "" : query.q ?? "";
  const result = await searchPeople(parsed, parsed.page);
  const one = (k: string) => {
    const v = query[k];
    return Array.isArray(v) ? v[0] ?? "" : v ?? "";
  };

  return (
    <>
      <section className="head fade">
        <h1>{say("peopleAdmin.title")}</h1>
        <p className="lede">{say("peopleAdmin.lede")}</p>
        <PeopleTabs current="search" />
        <form className="tk-filters people-search" method="get" action="/admin/people">
          <input type="search" name="q" defaultValue={q} placeholder={say("peopleAdmin.q.placeholder")} aria-label={say("peopleAdmin.q.aria")} />
          <input type="text" name="sport" defaultValue={one("sport")} placeholder={say("peopleAdmin.sport.placeholder")} aria-label={say("peopleAdmin.sport.aria")} autoComplete="off" />
          <input type="text" name="country" defaultValue={one("country")} placeholder={say("peopleAdmin.country.placeholder")} aria-label={say("peopleAdmin.country.aria")} maxLength={2} autoComplete="off" />
          <input type="number" name="born_from" defaultValue={one("born_from")} placeholder={say("peopleAdmin.bornFrom.placeholder")} aria-label={say("peopleAdmin.bornFrom.aria")} min={1800} max={2100} />
          <input type="number" name="born_to" defaultValue={one("born_to")} placeholder={say("peopleAdmin.bornTo.placeholder")} aria-label={say("peopleAdmin.bornTo.aria")} min={1800} max={2100} />
          <select name="seasons" defaultValue={one("seasons")} aria-label={say("peopleAdmin.seasons.aria")}>
            <option value="">{say("peopleAdmin.seasons.any")}</option>
            <option value="yes">{say("peopleAdmin.seasons.yes")}</option>
            <option value="no">{say("peopleAdmin.seasons.no")}</option>
          </select>
          <input type="text" name="source" defaultValue={one("source")} placeholder={say("peopleAdmin.source.placeholder")} aria-label={say("peopleAdmin.source.aria")} autoComplete="off" />
          <button type="submit" className="signin-btn">{say("peopleAdmin.submit")}</button>
          {parsed.words.length || parsed.sport || parsed.country || parsed.bornFrom || parsed.bornTo || parsed.seasons || parsed.source ? (
            <Link prefetch={false} href="/admin/people">{say("peopleAdmin.clear")}</Link>
          ) : null}
        </form>
      </section>
      <section className="section">
        {result.kind === "idle" ? <p className="note">{say("peopleAdmin.idle")}</p> : null}
        {result.kind === "error" ? <p className="note" role="alert">{say("peopleAdmin.error", { reason: result.message })}</p> : null}
        {result.kind === "ok" ? (
          <>
            {result.fallback ? <p className="note">{say("peopleAdmin.fallback")}</p> : null}
            <p className="note">{say("peopleAdmin.showing", { shown: result.rows.length, total: result.total, page: result.page, pages: result.pages })}</p>
            {result.rows.length === 0 ? (
              <p className="note">{say("peopleAdmin.none")}</p>
            ) : (
              <div className="scroll"><SortTable columns={COLUMNS} rows={result.rows.map(rowOf)} def="name.asc" label={say("peopleAdmin.table")} /></div>
            )}
            {result.pages > 1 ? (
              <nav className="tk-chips" aria-label={say("peopleAdmin.pager")}>
                {result.page > 1 ? <Link prefetch={false} href={hrefOf({ page: result.page - 1 }, query)}>{say("peopleAdmin.prev")}</Link> : null}
                {result.page < result.pages ? <Link prefetch={false} href={hrefOf({ page: result.page + 1 }, query)}>{say("peopleAdmin.next")}</Link> : null}
              </nav>
            ) : null}
          </>
        ) : null}
      </section>
    </>
  );
}
