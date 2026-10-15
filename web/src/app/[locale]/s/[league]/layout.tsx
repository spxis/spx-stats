import { SportMark } from "@/components/SportMark";

/** Every page of a league carries its mark: the header swoosh's centre takes the league's colour (components/SportMark.tsx). */
export default async function LeagueLayout({ children, params }: { children: React.ReactNode; params: Promise<{ league: string }> }) {
  const { league } = await params;
  return <SportMark sport={league}>{children}</SportMark>;
}
