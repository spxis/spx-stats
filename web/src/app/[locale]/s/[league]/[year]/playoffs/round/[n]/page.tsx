import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { SeriesCard } from "@/components/SeasonPlayoffs";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, LG, seasonLabel } from "@/lib/leagues";
import { pageMeta } from "@/lib/meta";
import { loadPlayoffs } from "@/lib/playoffs";
import { datedRound, playedYear, roundPath, roundTitle } from "@/lib/series";
import { parseSeasonSeg, seasonPath } from "@/lib/slug";
import { getPaths } from "@/lib/teamSlugs";
import { roundSay } from "@/lib/roundWords";
import "@/components/series.css";
import { guard, guardMeta } from "@/lib/loadGuard";

// Kept and revalidated every hour, once per language (lib/routing.ts); its data comes from the hour-long cache.

const roundOfParam = (v: string) => (/^\d{1,2}$/.test(v) ? Number(v) : null);

// Nothing is drawn at build time: each address is drawn on its first visit, then kept and revalidated like the rest.
export const generateStaticParams = () => [];

export const generateMetadata = guardMeta(async ({ params }: PageProps<"/[locale]/s/[league]/[year]/playoffs/round/[n]">): Promise<Metadata> => {
  const { league, year, n } = await params;
  const ys = isLeague(league) ? parseSeasonSeg(league, year) : null;
  const r = roundOfParam(n);
  if (!isLeague(league) || !ys || r == null) return {};
  const y = ys.y;
  const sp = await currentSpeaker();
  const d = await loadPlayoffs(league, y, roundSay(sp));
  const list = d.series.filter((_, i) => d.round[i] === r);
  if (!list.length) return { robots: { index: false } };
  const round = roundTitle(d.names, r, sp.say("playoffs.robin"));
  const season = seasonLabel(league, y);
  return pageMeta({
    title: sp.say("playoffs.round.metaTitle", { round, season, league: LG[league] }),
    description: sp.say("playoffs.round.metaDesc", { count: sp.fmt(list.length), round, season, league: LG[league] }),
    path: roundPath(league, y, r),
    locale: sp.locale,
  });
});

export default guard(async function PlayoffRoundPage({ params }: PageProps<"/[locale]/s/[league]/[year]/playoffs/round/[n]">) {
  const { league: lg, year, n } = await params;
  const ys = isLeague(lg) ? parseSeasonSeg(lg, year) : null;
  const r = roundOfParam(n);
  if (!isLeague(lg) || !ys || r == null) notFound();
  const y = ys.y;
  if (!ys.canonical) permanentRedirect(roundPath(lg, y, r));
  const paths = await getPaths();
  const sp = await currentSpeaker();
  const say = roundSay(sp);
  const d = await loadPlayoffs(lg, y, say);
  const members = d.series.map((_, i) => i).filter((i) => d.round[i] === r);
  if (!members.length) notFound();

  const season = seasonLabel(lg, y);
  const robin = sp.say("playoffs.robin");
  const name = roundTitle(d.names, r, robin);
  const dated = (rr: number) => datedRound(lg, y, Math.max(...d.series.filter((_, i) => d.round[i] === rr).map(playedYear)), roundTitle(d.names, rr, robin), rr === d.final, say);
  const hasRobin = d.bracket.robin.length > 0;
  const prev = r > 0 ? (r === 1 ? (hasRobin ? 0 : null) : r - 1) : null;
  const next = r === 0 ? (d.names.length ? 1 : null) : r < d.names.length ? r + 1 : null;
  const labelOf = (key: string) => d.bracket.sides.find((s) => s.key === key)?.label ?? null;
  const groups = (["l", "f", "r", "o"] as const)
    .map((key) => ({ key, label: key === "l" || key === "r" ? labelOf(key) : null, list: members.filter((i) => d.bracket.place.get(i) === key) }))
    .filter((g) => g.list.length);
  const titled = groups.some((g) => g.label);

  return (
    <>
      <AccentStyle league={lg} />
      <section className="head fade">
        <span className="eyebrow">
          <Link href={`/${lg}`}>{LG[lg]}</Link>{" · "}<Link href={seasonPath(lg, y)}>{say("page.seasonLink", { season })}</Link>{" · "}<Link href={`${seasonPath(lg, y)}#playoffs`}>{say("page.playoffs")}</Link>
        </span>
        <h1>{dated(r)}</h1>
        <p className="lede">{sp.say("playoffs.round.lede", { count: sp.fmt(members.length), round: name, season, league: LG[lg] })}</p>
        <p className="note">
          {prev != null ? <><Link href={roundPath(lg, y, prev)} prefetch={false} rel="prev">{"← " + dated(prev)}</Link>{" · "}</> : null}
          <Link href={`${seasonPath(lg, y)}#playoffs`}>{sp.say("playoffs.round.bracket")}</Link>
          {next != null ? <>{" · "}<Link href={roundPath(lg, y, next)} prefetch={false} rel="next">{dated(next) + " →"}</Link></> : null}
        </p>
      </section>
      {groups.map((g) => (
        <section key={g.key} className="section">
          {titled ? <h2>{g.label ?? (g.key === "o" ? sp.say("playoffs.other") : name)}</h2> : null}
          <div className="bracket mine">
            {g.list.map((i) => <SeriesCard paths={paths} key={`${d.series[i].sides[0].f}-${d.series[i].sides[1].f}-${d.series[i].meeting}`} lg={lg} s={d.series[i]} brands={d.brands} year={y} say={say} />)}
          </div>
        </section>
      ))}
    </>
  );
});
