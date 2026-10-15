import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { rows } from "@/lib/api/client";
import { requireAdmin } from "@/lib/auth/user";
import { getBrands, getLogoFits } from "@/lib/data";
import { sheetLogos } from "@/lib/logoSheet";
import { LogoSheet } from "./LogoSheet";

/**
 * The logo contact sheet, for an admin to review: every logo the site shows, in a circle (48 and 24 px), a square and a table row,
 * on a light and a dark page, plain and with its fit (db/seed/logo_fit.csv, api.logo_fit). Proposed fits are drawn here and nowhere
 * else; only approved ones reach the public pages. Admin is checked on the server for every request and anyone else gets a 404.
 * English only.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const metadata: Metadata = { title: "Logos to review", robots: { index: false, follow: false } };

const LEAGUES = ["nhl", "nba", "mlb", "nfl", "cfl"];
const SHOW = ["fit", "proposed", "approved", "plain"] as const;
type Show = (typeof SHOW)[number];
type Query = { league?: string; show?: string; q?: string };

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
  const league = LEAGUES.find((l) => l === query.league);
  const show = SHOW.find((s) => s === query.show);
  const text = (query.q ?? "").trim().slice(0, 100).toLowerCase();
  const matches = (l: (typeof all)[number], ignoreShow: boolean) =>
    (!league || l.league === league) &&
    (ignoreShow || !show || (show === "fit" ? l.fit !== null : show === "plain" ? l.fit === null : l.fit?.status === show)) &&
    (!text || `${l.teams.map((t) => t.name).join(" ")} ${l.file} ${l.fit?.note ?? ""}`.toLowerCase().includes(text));
  const shown = all.filter((l) => matches(l, false));
  const proposals = all.filter((l) => l.fit && l.fit.status !== "approved");

  const href = (next: Partial<Query>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...query, ...next })) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `/admin/logos?${qs}` : "/admin/logos";
  };
  const SHOW_LABEL: Record<Show, string> = { fit: "With a fit", proposed: "Proposed", approved: "Approved", plain: "No fit" };

  return (
    <>
      <section className="head fade">
        <h1>Logos to review</h1>
        <p className="lede">
          Every logo in a circle (48 and 24 px), a square and a table row, on a light and a dark page, plain and with the fit proposed for it.
          Proposed fits show only here. To approve, reject or change one, tell an agent which team; the same list is <code>db/seed/logo_fit.csv</code>
          and an approval is its <code>status</code> column.
        </p>
        <nav className="tk-chips" aria-label="Filter by league">
          <Link prefetch={false} className={league ? undefined : "on"} href={href({ league: undefined })}>All leagues</Link>
          {LEAGUES.map((l) => (
            <Link prefetch={false} key={l} className={league === l ? "on" : undefined} href={href({ league: l })}>{l.toUpperCase()}</Link>
          ))}
        </nav>
        <nav className="tk-chips" aria-label="Filter by fit">
          <Link prefetch={false} className={show ? undefined : "on"} href={href({ show: undefined })}>All <span>{all.filter((l) => matches(l, true)).length}</span></Link>
          {SHOW.map((s) => (
            <Link prefetch={false} key={s} className={show === s ? "on" : undefined} href={href({ show: s })}>
              {SHOW_LABEL[s]} <span>{all.filter((l) => (!league || l.league === league) && (s === "fit" ? l.fit !== null : s === "plain" ? l.fit === null : l.fit?.status === s)).length}</span>
            </Link>
          ))}
        </nav>
        <form className="tk-filters" method="get" action="/admin/logos">
          {league ? <input type="hidden" name="league" value={league} /> : null}
          {show ? <input type="hidden" name="show" value={show} /> : null}
          <input type="search" name="q" defaultValue={text} placeholder="Search a team or file" aria-label="Search logos" />
          <button type="submit" className="signin-btn">Filter</button>
          {league || show || text ? <Link prefetch={false} href="/admin/logos">Clear</Link> : null}
        </form>
        <p className="note">Showing {shown.length} of {all.length} logos. {fits.length === 0 ? "No fit data is loaded yet (api.logo_fit is empty or missing)." : ""}</p>
      </section>
      {proposals.length ? (
        <section className="section">
          <h2>Proposed and unapproved fits ({proposals.length})</h2>
          <div className="scroll">
            <table className="ls-proposals">
              <thead><tr><th>Team</th><th>Status</th><th>Problem and fix</th><th>Settings</th></tr></thead>
              <tbody>
                {proposals.map((l) => (
                  <tr key={l.file}>
                    <td><a href={`#${l.file.replace(/[^A-Za-z0-9_.-]+/g, "-")}`}>{l.teams[0].name}</a> <span className="note">{l.league.toUpperCase()}</span></td>
                    <td>{l.fit!.status}</td>
                    <td>{l.fit!.note}</td>
                    <td className="note">{l.fit!.mark_url ? "own mark; " : ""}{l.fit!.wordmark ? "wordmark; " : ""}scale {l.fit!.scale}, move {l.fit!.dx}/{l.fit!.dy}, tile {l.fit!.bg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      <section className="section">
        {shown.length === 0 ? <p className="note">No logos match.</p> : <LogoSheet logos={shown} />}
      </section>
    </>
  );
}
