import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { Credits } from "@/components/Credits";
import { WorldStackTable, WorldTeamsTable } from "@/components/WorldTables";
import { getLeagueCounts, getLeagueFranchises, getSeasonCounts } from "@/lib/countryData";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { hasPlayers, isLeague, LG } from "@/lib/leagues";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { worldTables } from "@/lib/worldData";
import "@/components/country.css";

export const revalidate = 2592000;

// Nothing is drawn at build time: each address is drawn on its first visit, then kept and revalidated like the rest.
export const generateStaticParams = () => [];

type Props = PageProps<"/[locale]/s/[league]/world/tables">;

/**
 * The two long tables of a league's world page with every row in them: the players by country season by season, and the clubs. The world page draws their
 * first rows, and its "Show all" is a link here where script is off.
 */
export const generateMetadata = guardMeta(async ({ params }: Props): Promise<Metadata> => {
  const { league } = await params;
  if (!isLeague(league) || !hasPlayers(league)) return {};
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: `${say("country.byTeam")} · ${say("country.areaTitle")} · ${LG[league]}`, description: say("country.worldMetaDesc", { league: LG[league] }), path: `/${league}/world/tables`, locale });
});

export default guard(async function LeagueWorldTablesPage({ params }: Props) {
  const { league: lg } = await params;
  if (!isLeague(lg) || !hasPlayers(lg)) notFound();
  const { say } = await currentSpeaker();
  const [seasonRows, leagueRows, franchiseRows] = await Promise.all([getSeasonCounts(lg), getLeagueCounts(lg), getLeagueFranchises(lg)]);
  if (!seasonRows?.length || !leagueRows?.length) notFound();
  const { stack, flags, teams } = await worldTables(lg, seasonRows, leagueRows, franchiseRows);
  const here = `/${lg}/world/tables`;
  return (
    <>
      <AccentStyle league={lg} />
      <section className="head fade">
        <span className="eyebrow"><Link href={`/${lg}`}>{LG[lg]}</Link></span>
        <h1>{say("country.worldTitle", { league: LG[lg] })}</h1>
        <p className="note"><Link href={`/${lg}/world`}>{say("country.leagueLink", { league: LG[lg] })}</Link> · <Link href="/countries">{say("country.allLink")}</Link></p>
      </section>
      <section className="section" id="seasons">
        <h2>{say("country.areaTitle")}</h2>
        <p className="note">{say("country.areaLeagueNote", { league: LG[lg] })}</p>
        <WorldStackTable stack={stack} league={lg} label={say("country.areaAria", { name: LG[lg] })} full hrefAll={here} />
      </section>
      {teams.lines.length ? (
        <section className="section" id="teams">
          <h2>{say("country.byTeam")}</h2>
          <p className="note">{say("country.byTeamNote")}</p>
          <WorldTeamsTable lg={lg} wire={teams} flags={flags} full hrefAll={here} label={say("country.byTeam")} />
        </section>
      ) : null}
      <p className="note">{say("country.noteSource")} <Credits say={say} use={["maps", "flags"]} /></p>
    </>
  );
});
