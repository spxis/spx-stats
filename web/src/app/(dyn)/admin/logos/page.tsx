import { DbChip } from "@/components/admin/DbChip";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { rows } from "@/lib/api/client";
import { BrandShieldExamples } from "@/components/BrandShieldExamples";
import { requireAdmin } from "@/lib/auth/user";
import { getBrands, getLogoFits } from "@/lib/data";
import { sheetLogos } from "@/lib/logoSheet";
import { LogoSheet } from "./LogoSheet";

/**
 * Logo approvals, for an admin: a top line says how many logo fits wait for approval (db/seed/logo_fit.csv, api.logo_fit, status proposed),
 * tabs split them by status, and each logo is a card drawn large on a light and a dark page, plain and with its fit. Proposed fits are drawn
 * here and nowhere else; only approved ones reach the public pages. Admin is checked on the server for every request and anyone else gets a 404.
 * English only.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const metadata: Metadata = { title: "Logo approvals", robots: { index: false, follow: false } };

const LEAGUES = ["nhl", "nba", "mlb", "nfl", "cfl"];
const SHOW = ["proposed", "approved", "rejected", "plain", "all"] as const;
type Show = (typeof SHOW)[number];
type Query = { league?: string; show?: string; q?: string; page?: string };
const PER_PAGE = 24;

const nameRow = z.object({ league: z.string(), franchise_id: z.number(), name: z.string() });

export default async function AdminLogosPage({ searchParams }: { searchParams: Promise<Query> }) {
  await requireAdmin();
  const query = await searchParams;
  const [brands, fits, names] = await Promise.all([
    getBrands(),
    getLogoFits(),
    rows("team_index", "select=league,franchise_id,name&order=league,franchise_id", nameRow).catch(() => []),
  ]);
  const all = sheetLogos(brands, new Map(names.map((n) => [`${n.league}|${n.franchise_id}`, n.name])), fits);
  const waiting = all.filter((l) => l.fit?.status === "proposed").length;
  const league = LEAGUES.find((l) => l === query.league);
  const show: Show = SHOW.find((s) => s === query.show) ?? (waiting ? "proposed" : "all");
  const text = (query.q ?? "").trim().slice(0, 100).toLowerCase();
  const inTab = (l: (typeof all)[number], s: Show) => s === "all" || (s === "plain" ? l.fit === null : l.fit?.status === s);
  const list = all.filter(
    (l) =>
      (!league || l.league === league) &&
      inTab(l, show) &&
      (!text || `${l.teams.map((t) => t.name).join(" ")} ${l.file} ${l.fit?.note ?? ""}`.toLowerCase().includes(text)),
  );
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1));
  const shown = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const href = (next: Partial<Query>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...query, ...next })) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `/admin/logos?${qs}` : "/admin/logos";
  };
  const TAB_LABEL: Record<Show, string> = { proposed: "Waiting for you", approved: "Approved", rejected: "Rejected", plain: "No fit yet", all: "All" };

  return (
    <>
      <section className="head fade">
        <h1>Logo approvals <DbChip db="production" /></h1>
        <div className={`lc-banner ${waiting ? "lc-banner-wait" : "lc-banner-ok"}`} role="status">
          <div>
            <b>{waiting ? `${waiting} logo${waiting === 1 ? "" : "s"} waiting for your approval` : "Nothing is waiting for your approval"}</b>
            <p>{waiting ? "Look at each card below and say yes or no." : "Every proposed logo fit has been decided."}</p>
          </div>
          {waiting && show !== "proposed" ? <Link prefetch={false} className="signin-btn lc-jump" href={href({ show: "proposed", page: undefined })}>Show them</Link> : null}
        </div>
        <details className="lc-help">
          <summary>How approving works</summary>
          <p>
            Each card shows the logo large on a light and a dark page. The first row is how the site draws it now; the second row is the proposed fit. If the second row looks better, tell an agent
            &ldquo;approve the (team) logo&rdquo;; if not, &ldquo;reject (team)&rdquo;. For many at once: &ldquo;approve all waiting NHL logos&rdquo;. The agent changes the <code>status</code> column in{" "}
            <code>db/seed/logo_fit.csv</code>; approved fits go live after the next data release. This page cannot change anything itself.
          </p>
        </details>
        <nav className="tk-chips lc-tabs" aria-label="Tabs">
          {SHOW.map((s) => (
            <Link prefetch={false} key={s} className={show === s ? "on" : undefined} href={href({ show: s, page: undefined })}>
              {TAB_LABEL[s]} <span>{all.filter((l) => (!league || l.league === league) && inTab(l, s)).length}</span>
            </Link>
          ))}
        </nav>
        <nav className="tk-chips lc-tabs" aria-label="Filter by league">
          <Link prefetch={false} className={league ? undefined : "on"} href={href({ league: undefined, page: undefined })}>All leagues</Link>
          {LEAGUES.map((l) => (
            <Link prefetch={false} key={l} className={league === l ? "on" : undefined} href={href({ league: l, page: undefined })}>{l.toUpperCase()}</Link>
          ))}
        </nav>
        <form className="tk-filters" method="get" action="/admin/logos">
          {league ? <input type="hidden" name="league" value={league} /> : null}
          <input type="hidden" name="show" value={show} />
          <input type="search" name="q" defaultValue={text} placeholder="Search a team" aria-label="Search logos" />
          <button type="submit" className="signin-btn">Search</button>
          {league || text ? <Link prefetch={false} href={href({ league: undefined, q: undefined, page: undefined })}>Clear</Link> : null}
        </form>
        {fits.length === 0 ? <p className="note">No fit data is loaded yet (api.logo_fit is empty or missing).</p> : null}
      </section>
      <section className="section">
        {shown.length === 0 ? <p className="note">No logos in this tab.</p> : <LogoSheet logos={shown} />}
        {pages > 1 ? (
          <nav className="lc-pager" aria-label="Pages">
            {page > 1 ? <Link prefetch={false} href={href({ page: String(page - 1) })}>&larr; Previous</Link> : null}
            <span>Page {page} of {pages} ({list.length} logos)</span>
            {page < pages ? <Link prefetch={false} href={href({ page: String(page + 1) })}>Next &rarr;</Link> : null}
          </nav>
        ) : null}
      </section>
      <section className="section">
        <details className="lc-help">
          <summary>Shield container (preview, not on the public site)</summary>
          <BrandShieldExamples labels={{ logoTeam: "Logo, team colours", abbrTeam: "Abbreviation, team colours", logoNavy: "Logo, SPXN navy", abbrNavy: "Abbreviation, SPXN navy, league in the band" }} />
        </details>
      </section>
    </>
  );
}
