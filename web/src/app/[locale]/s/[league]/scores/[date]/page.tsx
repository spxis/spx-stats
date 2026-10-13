import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Scoreboard } from "@/components/Scoreboard";
import { isLeague } from "@/lib/leagues";
import { parseDay } from "@/lib/scores";
import { scoresMeta } from "@/lib/scoresData";

// Nothing is drawn at build time: each address is drawn on its first visit, then kept and revalidated like the rest.
export const generateStaticParams = () => [];

export async function generateMetadata({ params }: PageProps<"/[locale]/s/[league]/scores/[date]">): Promise<Metadata> {
  const { league, date } = await params;
  const day = parseDay(date);
  return isLeague(league) && day ? scoresMeta(league, day) : {};
}

export default async function ScoresDayPage({ params }: PageProps<"/[locale]/s/[league]/scores/[date]">) {
  const { league: lg, date } = await params;
  const day = parseDay(date);
  if (!isLeague(lg) || !day) notFound();
  return <Scoreboard lg={lg} day={day} />;
}
