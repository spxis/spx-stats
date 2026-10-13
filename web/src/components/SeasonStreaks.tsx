import Link from "next/link";
import { TeamLogo } from "@/components/TeamLogo";
import type { StandingRow } from "@/lib/api/types";
import { logoFor, type BrandMap } from "@/lib/brand";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { GameTuple } from "@/lib/season";
import { longestCurrent, regularSeasonOpen, resultsByTeam, type LeagueStreak, type PlayedGame } from "@/lib/streaks";
import "./leaders.css";

/** The final regular-season games of a season's compact list, in the shape the streak functions read. */
const playedGames = (games: GameTuple[]): PlayedGame[] =>
  games.flatMap((g) => (g[5] === "r" && g[6] === "f" && g[2] != null && g[3] != null ? [{ date: g[0], away: g[1], home: g[4], awayScore: g[2], homeScore: g[3], overtime: g[8] === 1 }] : []));

/**
 * Two boxes above the standings of a season that is being played: the longest winning streak and the longest losing
 * streak still running, set out like the team leaders' cards. Nothing for a finished season or one with no streak yet.
 */
export async function SeasonStreaks({ year, games, standings, champion, brands, href }: {
  year: number; games: GameTuple[]; standings: StandingRow[]; champion: boolean; brands: BrandMap; href: (franchise: number) => string;
}) {
  if (!regularSeasonOpen(games.map((g) => ({ regular: g[5] === "r", scheduled: g[6] === "s" })), champion)) return null;
  const countsOtl = standings.some((r) => r.otl != null);
  const results = resultsByTeam(playedGames(games), countsOtl);
  const hot = longestCurrent(results, "W");
  const cold = longestCurrent(results, "L");
  if (!hot && !cold) return null;

  const { say, fmt } = await currentSpeaker();
  const breaks = countsOtl || games.some((g) => g[5] === "r" && g[6] === "f" && g[2] != null && g[2] === g[3]);
  const card = (streak: LeagueStreak | null, kind: "W" | "L") => {
    if (!streak) return null;
    // The club whose record is best leads when several share the streak.
    const rows = standings.filter((r) => streak.teams.includes(r.team_id));
    if (!rows.length) return null;
    const first = rows[0];
    return (
      <Link key={kind} className="lcard" href={href(first.franchise_id)} prefetch={false}>
        <span className="lname"><span>{say(kind === "W" ? "streaks.hot" : "streaks.cold")}</span></span>
        <span className="lbig">{`${say(kind === "W" ? "col.w" : "col.l")}${fmt(streak.length)}`}</span>
        <span className="lwho">
          <TeamLogo url={logoFor(brands, first.franchise_id, year)} size={24} shape="square" />
          <span>{first.team ?? say("team.fallback", { id: first.franchise_id })}</span>
          {rows.length > 1 ? <span className="lmore">{`+${rows.length - 1}`}</span> : null}
        </span>
        <span className="lchips"><span className="lchip">{say("leaders.inProgress")}</span></span>
      </Link>
    );
  };
  const cards = [card(hot, "W"), card(cold, "L")].filter(Boolean);
  if (!cards.length) return null;
  return (
    <>
      <div className="lcards">{cards}</div>
      <p className="note">{`${say(breaks ? "streaks.noteBreak" : "streaks.note")} ${say("streaks.noteMin")}`}</p>
    </>
  );
}
