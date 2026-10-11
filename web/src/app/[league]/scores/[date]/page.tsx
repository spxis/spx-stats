import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Scoreboard } from "@/components/Scoreboard";
import { isLeague } from "@/lib/leagues";
import { parseDay } from "@/lib/scores";
import { scoresMeta } from "@/lib/scoresData";

export async function generateMetadata({ params }: PageProps<"/[league]/scores/[date]">): Promise<Metadata> {
  const { league, date } = await params;
  const day = parseDay(date);
  return isLeague(league) && day ? scoresMeta(league, day) : {};
}

export default async function ScoresDayPage({ params }: PageProps<"/[league]/scores/[date]">) {
  const { league: lg, date } = await params;
  const day = parseDay(date);
  if (!isLeague(lg) || !day) notFound();
  return <Scoreboard lg={lg} day={day} />;
}
