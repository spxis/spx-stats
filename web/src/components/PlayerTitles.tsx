import Link from "@/components/Link";
import { CupsProvider, MiniCup } from "@/components/TrophyIcon";
import { cupsFor } from "@/lib/cups";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, LG, seasonLabel } from "@/lib/leagues";
import { seasonPath } from "@/lib/slug";

/** A player's championship seasons as chips, each with its league's cup (MiniCup). */
export async function PlayerTitles({ titles }: { titles: { league: string; year: number; team: string | null }[] }) {
  if (!titles.length) return null;
  const { say, fmt } = await currentSpeaker();
  const leagueName = (l: string) => (isLeague(l) ? LG[l] : l);
  return (
    <section className="section">
      <h2>{say("player.titles", { count: fmt(titles.length) })}</h2>
      <CupsProvider markup={cupsFor(titles.map((t) => t.league))}>
        <div className="seasonlist">
          {titles.map((t) => (
            <Link key={`${t.league}${t.year}`} className="full" href={seasonPath(t.league, t.year)} prefetch={false} title={say("player.titleTip", { team: t.team ?? "", league: leagueName(t.league) })}>
              <MiniCup league={t.league} />{`${leagueName(t.league)} ${seasonLabel(t.league, t.year)}`}
            </Link>
          ))}
        </div>
      </CupsProvider>
      <p className="note">{say("player.titlesNote")}</p>
    </section>
  );
}
