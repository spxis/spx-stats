import Link from "@/components/Link";
import { TeamLogo } from "@/components/TeamLogo";
import type { StandingRow } from "@/lib/api/types";
import { logoFor, type BrandMap } from "@/lib/brand";
import { atUtc, fmt3 } from "@/lib/format";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { GameTuple } from "@/lib/season";
import { bestSide, longestOfSeason } from "@/lib/seasonBoxes";
import { longestCurrent, regularSeasonOpen, resultsByTeam, type PlayedGame } from "@/lib/streaks";
import "./leaders.css";

/** The final regular-season games of a season's compact list, in the shape the streak functions read. */
const playedGames = (games: GameTuple[]): PlayedGame[] =>
  games.flatMap((g) => (g[5] === "r" && g[6] === "f" && g[2] != null && g[3] != null ? [{ date: g[0], away: g[1], home: g[4], awayScore: g[2], homeScore: g[3], overtime: g[8] === 1 }] : []));

interface Card {
  key: string;
  label: string;
  big: string;
  /** The teams that share the figure; the first leads (standings order puts the best record first). */
  teams: number[];
  chips: string[];
  top?: boolean;
}

/**
 * The boxes above the standings of a season, set out like the team leaders' cards. A season being played shows the longest winning and losing streak
 * still running (hottest and coldest); a finished one shows the longest winning and losing streak it had, with the team, length and dates. Both
 * show the best home team and the best road team (by share of games won at home and on the road, wins breaking a tie).
 */
export async function SeasonStreaks({ year, games, standings, champion, brands, href }: {
  year: number; games: GameTuple[]; standings: StandingRow[]; champion: boolean; brands: BrandMap; href: (franchise: number) => string;
}) {
  const { say, fmt, dt } = await currentSpeaker();
  const open = regularSeasonOpen(games.map((g) => ({ regular: g[5] === "r", scheduled: g[6] === "s" })), champion);
  const countsOtl = standings.some((r) => r.otl != null);
  const results = resultsByTeam(playedGames(games), countsOtl);
  const span = (from: string, to: string) => (from === to ? dt.monthDayShort(atUtc(from)) : `${dt.monthDayShort(atUtc(from))} – ${dt.monthDayShort(atUtc(to))}`);

  const cards: Card[] = [];
  if (open) {
    const hot = longestCurrent(results, "W"), cold = longestCurrent(results, "L");
    if (hot) cards.push({ key: "hot", label: say("streaks.hot"), big: `${say("col.w")}${fmt(hot.length)}`, teams: hot.teams, chips: [say("leaders.inProgress")] });
    if (cold) cards.push({ key: "cold", label: say("streaks.cold"), big: `${say("col.l")}${fmt(cold.length)}`, teams: cold.teams, chips: [say("leaders.inProgress")] });
  } else {
    const win = longestOfSeason(results, "W"), loss = longestOfSeason(results, "L");
    if (win) cards.push({ key: "win", label: say("streaks.longestWin"), big: `${say("col.w")}${fmt(win.length)}`, teams: win.runs.map((r) => r.team), chips: [span(win.runs[0].run.from, win.runs[0].run.to)] });
    if (loss) cards.push({ key: "loss", label: say("streaks.longestLoss"), big: `${say("col.l")}${fmt(loss.length)}`, teams: loss.runs.map((r) => r.team), chips: [span(loss.runs[0].run.from, loss.runs[0].run.to)] });
  }
  const streakCards = cards.length;
  const home = bestSide(standings, "home", countsOtl), road = bestSide(standings, "road", countsOtl);
  if (home) cards.push({ key: "home", label: say("season.bestHome"), big: home.text, teams: home.teams, chips: [fmt3(home.share)] });
  if (road) cards.push({ key: "road", label: say("season.bestRoad"), big: road.text, teams: road.teams, chips: [fmt3(road.share)] });
  if (!cards.length) return null;

  const breaks = countsOtl || games.some((g) => g[5] === "r" && g[6] === "f" && g[2] != null && g[2] === g[3]);
  const view = (c: Card) => {
    // The club whose record is best leads when several share the figure.
    const rows = standings.filter((r) => c.teams.includes(r.team_id));
    const first = c.key === "win" || c.key === "loss" ? standings.find((r) => r.team_id === c.teams[0]) ?? rows[0] : rows[0];
    if (!first) return null;
    return (
      <Link key={c.key} className="lcard" href={href(first.franchise_id)} prefetch={false}>
        <span className="lname"><span>{c.label}</span></span>
        <span className="lbig">{c.big}</span>
        <span className="lwho">
          <TeamLogo url={logoFor(brands, first.franchise_id, year)} size={24} shape="square" />
          <span>{first.team ?? say("team.fallback", { id: first.franchise_id })}</span>
          {rows.length > 1 ? <span className="lmore">{`+${rows.length - 1}`}</span> : null}
        </span>
        <span className="lchips">{c.chips.map((t) => <span key={t} className="lchip">{t}</span>)}</span>
      </Link>
    );
  };
  return (
    <>
      <div className="lcards">{cards.map(view)}</div>
      {streakCards ? <p className="note">{`${say(breaks ? "streaks.noteBreak" : "streaks.note")} ${say("streaks.noteMin")}`}</p> : null}
    </>
  );
}
