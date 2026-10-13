import type { Metadata } from "next";
import Link from "next/link";
import { SortTable } from "@/components/SortTable";
import { PERSON_REVIEW, type ReviewPair, type ReviewSide } from "@/data/personReview";
import { requireAdmin } from "@/lib/auth/user";
import { playerPath } from "@/lib/playerPath";
import { parseSort, type SortColumn, type SortRow } from "@/lib/sort";

/**
 * People records that might be one person, for an admin to decide. The list is a snapshot in the code
 * (db/seed/person_review.csv, made by db/review/person_review.sql), never read from the database, so
 * nothing about it is public: admin is checked on the server for every request and anyone else gets a 404.
 * Each name links to the player page the site already shows. English only.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const metadata: Metadata = { title: "People to check", robots: { index: false, follow: false } };

const LEANS: ReviewPair["lean"][] = ["possibly one person", "unknown", "probably two people"];
const COLUMNS: SortColumn[] = [
  { key: "lean", label: "Looks like" },
  { key: "a", label: "Record A" },
  { key: "b", label: "Record B" },
  { key: "why", label: "Why unsure" },
];
const KEYS = COLUMNS.map((c) => c.key);

type Query = { lean?: string; q?: string; sort?: string };

function years(s: ReviewSide): string {
  if (s.from === null) return "no seasons";
  return s.from === s.to || s.to === null ? String(s.from) : `${s.from}–${s.to}`;
}

function Side({ s }: { s: ReviewSide }) {
  return (
    <div>
      <Link href={playerPath(s.league, s.id, s.name)}>{s.name}</Link> <span className="note">#{s.id}, {s.kind}, {s.league.toUpperCase()}</span>
      <div className="note">{years(s)}{s.born ? `, born ${s.born}` : ""}</div>
      {s.clubs ? <div className="note">{s.clubs}</div> : null}
      <div className="note">{s.sources}</div>
    </div>
  );
}

function rowOf(p: ReviewPair, i: number): SortRow {
  return {
    id: `${p.a.id}-${p.b.id}`,
    sort: { lean: LEANS.indexOf(p.lean), a: p.a.name.toLowerCase(), b: p.b.name.toLowerCase(), why: i },
    cells: { lean: p.lean, a: <Side s={p.a} />, b: <Side s={p.b} />, why: <span className="note">{p.why}</span> },
  };
}

export default async function AdminPeoplePage({ searchParams }: { searchParams: Promise<Query> }) {
  await requireAdmin();
  const query = await searchParams;
  const lean = LEANS.find((l) => l === query.lean);
  const text = (query.q ?? "").trim().slice(0, 100);
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (p: ReviewPair, ignoreLean: boolean) =>
    (ignoreLean || !lean || p.lean === lean) &&
    words.every((w) => `${p.a.name} ${p.b.name} ${p.a.id} ${p.b.id} ${p.a.sources} ${p.b.sources} ${p.why}`.toLowerCase().includes(w));
  const shown = PERSON_REVIEW.filter((p) => matches(p, false));
  const sort = parseSort(query.sort, KEYS, "lean.asc");

  const href = (next: Partial<Query>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...query, ...next })) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `/admin/people?${qs}` : "/admin/people";
  };

  return (
    <>
      <section className="head fade">
        <h1>People to check</h1>
        <p className="lede">
          Pairs of records whose names fit and nothing contradicts, but nothing confirms either: no shared season, birth date or
          other id. They are not merged. Tell an agent which pairs are one person and it merges them. The same list is
          <code> db/seed/person_review.csv</code>.
        </p>
        <nav className="tk-chips" aria-label="Filter by how it looks">
          <Link prefetch={false} className={lean ? undefined : "on"} href={href({ lean: undefined })}>All <span>{PERSON_REVIEW.filter((p) => matches(p, true)).length}</span></Link>
          {LEANS.map((l) => (
            <Link prefetch={false} key={l} className={lean === l ? "on" : undefined} href={href({ lean: l })}>
              {l} <span>{PERSON_REVIEW.filter((p) => p.lean === l && matches(p, true)).length}</span>
            </Link>
          ))}
        </nav>
        <form className="tk-filters" method="get" action="/admin/people">
          {lean ? <input type="hidden" name="lean" value={lean} /> : null}
          {query.sort ? <input type="hidden" name="sort" value={query.sort} /> : null}
          <input type="search" name="q" defaultValue={text} placeholder="Search a name, id or source" aria-label="Search people" />
          <button type="submit" className="signin-btn">Filter</button>
          {lean || text ? <Link prefetch={false} href="/admin/people">Clear</Link> : null}
        </form>
        <p className="note">Showing {shown.length} of {PERSON_REVIEW.length}</p>
      </section>
      <section className="section">
        {shown.length === 0 ? (
          <p className="note">No pairs match.</p>
        ) : (
          <div className="scroll"><SortTable columns={COLUMNS} rows={shown.map(rowOf)} def="lean.asc" initial={sort} label="People to check" /></div>
        )}
      </section>
    </>
  );
}
