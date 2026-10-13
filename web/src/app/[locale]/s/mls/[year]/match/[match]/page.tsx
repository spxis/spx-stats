import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { MlsClubName } from "@/components/MlsClubName";
import { MlsCredit } from "@/components/MlsCredit";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { getMlsMatch } from "@/lib/mls";
import { MLS_PATH, mlsMatchPath, mlsSeasonPath } from "@/lib/mlsPath";
import { mlsScoreLines, mlsStageName } from "@/lib/mlsView";
import type { Match } from "@/lib/soccer";
import { soccerMatchIdOf } from "@/lib/soccerPath";
import "@/components/soccer.css";

export const revalidate = 3600;

// Nothing is drawn at build time: each match is drawn on its first visit, then kept and revalidated like the rest.
export const generateStaticParams = () => [];

type Params = PageProps<"/[locale]/s/mls/[year]/match/[match]">;

async function find(year: string, seg: string): Promise<Match | null> {
  const id = /^\d{4}$/.test(year) ? soccerMatchIdOf(seg) : null;
  const m = id == null ? null : await getMlsMatch(id);
  return m && String(m.year) === year ? m : null;
}

export const generateMetadata = guardMeta(async ({ params }: Params): Promise<Metadata> => {
  const { year, match } = await params;
  const m = await find(year, match);
  if (!m) return {};
  const { say, locale } = await currentSpeaker();
  const title = `${m.home} ${m.home_goals}–${m.away_goals} ${m.away}`;
  return pageMeta({
    title,
    description: say("mls.m.metaDesc", { title, stage: mlsStageName(say, m.stage_key), year: m.year }),
    path: mlsMatchPath(m.year, m.match_id, m.home, m.away),
    locale,
  });
});

export default guard(async function MlsMatchPage({ params }: Params) {
  const { year, match } = await params;
  const m = await find(year, match);
  if (!m) notFound();
  const canonical = mlsMatchPath(m.year, m.match_id, m.home, m.away);
  if (`/mls/${year}/match/${match}` !== canonical) permanentRedirect(canonical);
  const { say, fmt, dt } = await currentSpeaker();
  const sc = mlsScoreLines(say, m);
  // A stadium is shown as the source names it, as plain text: the stadium pages belong to the world stadium dataset, which joins by m.venue_wikidata_id.
  const venue = [m.venue_name, m.venue_city, m.venue_country].filter(Boolean).join(", ");
  return (
    <div className="soccer">
      <section className="head fade">
        <span className="eyebrow"><Link href={mlsSeasonPath(m.year)}>{say("mls.season", { year: m.year })}</Link> · {mlsStageName(say, m.stage_key)}</span>
        <h1>{m.home} – {m.away}</h1>
        <p className="lede">{dt.full(new Date(m.match_date))}{venue ? ` · ${venue}` : ""}{m.attendance ? ` · ${say("mls.m.crowd", { n: fmt(m.attendance) })}` : ""}</p>
      </section>
      <section className="sc-board" aria-label={say("wc.m.result")}>
        <div className="side"><span className="nm"><MlsClubName slug={m.home_slug} name={m.home} /></span></div>
        <div className="mid">
          <div className="big">{sc.main}</div>
          {sc.note ? <div className="sub">{sc.note}</div> : null}
        </div>
        <div className="side away"><span className="nm"><MlsClubName slug={m.away_slug} name={m.away} /></span></div>
      </section>
      {m.checked === 1 ? <p className="note">{say("mls.m.confirmed")}</p> : null}
      <p className="note">{say("mls.m.noDetail")} <Link href={MLS_PATH}>{say("mls.team.all")}</Link></p>
      <section className="section"><MlsCredit say={say} /></section>
    </div>
  );
});
