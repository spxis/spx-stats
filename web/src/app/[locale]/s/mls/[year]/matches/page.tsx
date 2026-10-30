import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { MlsCredit } from "@/components/MlsCredit";
import { MlsMatchesTable } from "@/components/MlsMatchesTable";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { getMlsMatches, mlsSeasonOfYear } from "@/lib/mls";
import { buildMlsMatches, mlsMatchesPath } from "@/lib/mlsLines";
import { mlsSeasonPath } from "@/lib/mlsPath";
import "@/components/soccer.css";

export const revalidate = 2592000;

// Every match of a season on a page of its own: the "Show all" of the season page is a link here where script is off. Drawn on its first visit, then kept.
export const generateStaticParams = () => [];

type Params = PageProps<"/[locale]/s/mls/[year]/matches">;
const isYear = (s: string) => /^\d{4}$/.test(s);

export const generateMetadata = guardMeta(async ({ params }: Params): Promise<Metadata> => {
  const { year } = await params;
  if (!isYear(year)) return {};
  const s = await mlsSeasonOfYear(Number(year));
  if (!s) return {};
  const { say, locale } = await currentSpeaker();
  const title = `${say("mls.season", { year: s.year })}: ${say("wc.t.matches")}`;
  return pageMeta({ title, description: say("mls.s.lede", { teams: s.team_count ?? 0, dates: String(s.year) }), path: mlsMatchesPath(s.year), locale });
});

export default guard(async function MlsMatchesPage({ params }: Params) {
  const { year } = await params;
  if (!isYear(year)) notFound();
  const s = await mlsSeasonOfYear(Number(year));
  if (!s) notFound();
  const { say } = await currentSpeaker();
  const matches = await getMlsMatches(s.tournament_id);
  if (!matches.length) notFound();
  return (
    <div className="soccer">
      <section className="head fade">
        <span className="eyebrow">{say("mls.title")}</span>
        <h1>{say("mls.season", { year: s.year })}</h1>
        <p className="note"><Link href={mlsSeasonPath(s.year)}>{say("mls.season", { year: s.year })}</Link></p>
      </section>
      <section className="section scroll">
        <h2>{say("wc.t.matches")}</h2>
        <MlsMatchesTable year={s.year} wire={buildMlsMatches(matches)} full hrefAll={mlsMatchesPath(s.year)} label={say("wc.t.matches")} />
      </section>
      <section className="section"><MlsCredit say={say} /></section>
    </div>
  );
});
