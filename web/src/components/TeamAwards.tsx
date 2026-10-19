import { AwardsTable } from "@/components/AwardsTable";
import { CupSprite } from "@/components/CupSprite";
import Link from "@/components/Link";
import { AWARD_HEAD } from "@/lib/awardLines";
import { trophiesPath } from "@/lib/awardTrophy";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { leagueInfo } from "@/lib/leagues";
import { teamAwardLines } from "@/lib/teamAwardLines";

/** The awards a franchise won and its players won while on it, newest first; nothing at all when there are none. `full` lists every one (the franchise's full list page), else the newest few and a "Show all". */
export async function TeamAwards({ lg, f, teamPath, full = false }: { lg: string; f: number; teamPath: string; full?: boolean }) {
  const list = await teamAwardLines(lg, f);
  if (!list?.lines.length) return null;
  const { say, plural } = await currentSpeaker();
  return (
    <section className="section" id="awards">
      <h2>{say("awards.title")}</h2>
      <p className="note">{say("awards.teamNote", { awards: plural("count.awards", list.lines.length) })} <Link href={trophiesPath(lg)} prefetch={false}>{say("trophies.seeAll", { league: leagueInfo(lg)?.short ?? lg.toUpperCase() })}</Link></p>
      <CupSprite leagues={[lg]} />
      <div className="tablebox"><AwardsTable lg={lg} teamPath={teamPath} head={full ? list.lines : list.lines.slice(0, AWARD_HEAD)} logos={list.logos} total={list.lines.length} /></div>
    </section>
  );
}
