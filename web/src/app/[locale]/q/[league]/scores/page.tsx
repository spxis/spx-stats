import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Scoreboard } from "@/components/Scoreboard";
import { isLeague } from "@/lib/leagues";
import { scoresPath } from "@/lib/scores";
import { defaultDay, scoresMeta, seasonDay } from "@/lib/scoresData";
import { parseSeasonSeg } from "@/lib/slug";
import { guard } from "@/lib/loadGuard";

export async function generateMetadata({ params }: PageProps<"/[locale]/q/[league]/scores">): Promise<Metadata> {
  const { league } = await params;
  if (!isLeague(league)) return {};
  const day = await defaultDay(league).catch(() => null);
  return day ? scoresMeta(league, day) : {};
}

/** /nhl/scores opens on today's games (else the latest day with games); ?season=2022-23 opens that season's last day. */
export default guard(async function ScoresPage({ params, searchParams }: PageProps<"/[locale]/q/[league]/scores">) {
  const { league: lg } = await params;
  if (!isLeague(lg)) notFound();
  const { season } = await searchParams;
  const ys = typeof season === "string" ? parseSeasonSeg(lg, season) : null;
  const day = ys ? await seasonDay(lg, ys.y) : await defaultDay(lg);
  if (ys && day) redirect(scoresPath(lg, day));
  if (!day) notFound();
  return <Scoreboard lg={lg} day={day} />;
});
