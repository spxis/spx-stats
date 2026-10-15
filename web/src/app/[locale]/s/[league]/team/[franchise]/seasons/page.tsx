import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { StandingsTable } from "@/components/StandingsTable";
import { TeamAwards } from "@/components/TeamAwards";
import { CupsProvider } from "@/components/TrophyIcon";
import { cupsFor } from "@/lib/cups";
import { getAbbrs, getBrands, getSummary, getTeam, getTeamStandings } from "@/lib/data";
import { franchiseSeasonRows, standLines } from "@/lib/franchiseRows";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { brandFor, teamAccent } from "@/lib/brand";
import { isLeague, LG } from "@/lib/leagues";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { standPagePath } from "@/lib/standLines";
import { teamOf } from "@/lib/teamSlugs";

export const revalidate = 86400;

// Nothing is drawn at build time: each address is drawn on its first visit, then kept and revalidated like the rest.
export const generateStaticParams = () => [];

type Props = PageProps<"/[locale]/s/[league]/team/[franchise]/seasons">;

/**
 * Every season of a franchise's standings on a page of its own: the list the franchise page cuts to its newest seasons (its "Show all" is a link
 * here where script is off). The same table, with every row in it.
 */
export const generateMetadata = guardMeta(async ({ params }: Props): Promise<Metadata> => {
  const { league, franchise } = await params;
  if (!isLeague(league)) return {};
  const at = await teamOf(league, franchise);
  if (!at) return {};
  const t = await getTeam(league, at.f);
  if (!t) return {};
  const { say, plural, locale } = await currentSpeaker();
  const name = t.names.at(-1)?.name || say("team.fallback", { id: at.f });
  return pageMeta({ title: `${say("team.standings")} · ${name} · ${LG[league]}`, description: say("team.standingsNote", { seasons: plural("count.seasons", t.seasons.length + t.unrecorded.length) }), path: standPagePath(at.path), locale });
});

export default guard(async function SeasonsPage({ params }: Props) {
  const { league: lg, franchise } = await params;
  if (!isLeague(lg)) notFound();
  const at = await teamOf(lg, franchise);
  if (!at) notFound();
  if (at.path !== `/${lg}/team/${franchise}`) permanentRedirect(standPagePath(at.path));
  const f = at.f;
  const { say, plural } = await currentSpeaker();
  const [t, rows, brands, abbrs, summary] = await Promise.all([getTeam(lg, f), getTeamStandings(lg, f), getBrands(), getAbbrs(lg), getSummary()]);
  if (!t) notFound();
  const won = new Set(t.titles);
  const { withGames, idle, bare, tableRows } = await franchiseSeasonRows(lg, f, t, rows, summary.seasons, say);
  const { lines, flags } = standLines(f, tableRows, won, idle, bare, withGames, brands, abbrs, rows);
  const now = t.names.at(-1)?.name || say("team.fallback", { id: f });
  const b = brandFor(brands, f);
  return (
    <CupsProvider markup={cupsFor(won.size ? [lg] : [])}>
      <AccentStyle league={lg} team={b?.primary_hex ? teamAccent(b) : undefined} />
      <section className="head fade">
        <span className="eyebrow"><Link href={`/${lg}`}>{LG[lg]}</Link></span>
        <h1>{now}</h1>
        <p className="note"><Link href={at.path}>{say("team.backToTeam", { name: now })}</Link></p>
      </section>
      <section className="section">
        <h2>{say("team.standings")}</h2>
        <p className="note">{say("team.standingsNote", { seasons: plural("count.seasons", lines.length) })}</p>
        <div className="tablebox"><StandingsTable lg={lg} f={f} teamPath={at.path} head={lines} total={lines.length} flags={flags} /></div>
      </section>
      <TeamAwards lg={lg} f={f} teamPath={at.path} full />
    </CupsProvider>
  );
});
