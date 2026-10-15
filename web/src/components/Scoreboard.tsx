import Link from "next/link";
import type { GameRow } from "@/lib/api/types";
import { logoFor } from "@/lib/brand";
import { getBrands, getSummary } from "@/lib/data";
import { atUtc } from "@/lib/format";
import { gamePath } from "@/lib/gamePath";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { LG, type LeagueCode } from "@/lib/leagues";
import { addDay, scoresPath, todayUtc } from "@/lib/scores";
import { loadScores } from "@/lib/scoresData";
import { AccentStyle } from "./AccentStyle";
import { StartTime } from "./StartTime";
import { DayStrip } from "./DayStrip";
import { ScoresBar } from "./ScoresBar";
import { TeamLabel } from "./TeamLabel";
import { Badge } from "./ui";
import "./scores.css";
import "./game.css";

type Brands = Awaited<ReturnType<typeof getBrands>>;
type Say = Awaited<ReturnType<typeof currentSpeaker>>["say"];

const PHASE_TAG: Record<string, "phase.playoffs" | "phase.preseason" | "phase.allStar"> = {
  playoffs: "phase.playoffs", preseason: "phase.preseason", all_star: "phase.allStar",
};

function Game({ lg, g, brands, say, upcoming }: { lg: LeagueCode; g: GameRow; brands: Brands; say: Say; upcoming: boolean }) {
  const final = g.status === "final" && g.home_score != null && g.away_score != null;
  const away = final && g.away_score! > g.home_score!, home = final && g.home_score! > g.away_score!;
  const extra = say(lg === "mlb" ? "game.extras" : "game.ot");
  const page = gamePath(lg, g.year, g.game_id, g.away, g.home);
  const title = say("gm.viewGameTitle", { away: g.away ?? "—", home: g.home ?? "—" });
  const side = (id: number, f: number | null, name: string | null, score: number | null, won: boolean) => (
    <div className={"srow" + (won ? " won" : "")}>
      <span className="sname"><TeamLabel lg={lg} f={f} name={name || "—"} year={g.year} className={won ? "won" : undefined} logo={logoFor(brands, f, g.year)} size={32} shape="square" /></span>
      <b className="sscore">{final ? <Link href={page} prefetch={false} title={title}>{score}</Link> : ""}</b>
    </div>
  );
  return (
    <li className="sgame">
      {side(g.away_id, g.away_f, g.away, g.away_score, away)}
      {side(g.home_id, g.home_f, g.home, g.home_score, home)}
      <div className="sinfo">
        <span className={"sstate" + (final ? "" : " pending")}>
          {final ? (g.overtime ? say("scores.finalExtra", { extra }) : say("scores.final")) : upcoming ? say("scores.scheduled") : say("scores.noResult")}
        </span>
        {!final && upcoming && g.starts_at ? (
          <span className="stime" title={say("scores.scheduledStart")}><StartTime iso={g.starts_at} gameDate={g.game_date} /></span>
        ) : null}
        {PHASE_TAG[g.phase] ? <span className="badge tag">{say(PHASE_TAG[g.phase])}</span> : null}
        <Badge src={g.source} />
        {g.checked === 1 ? <span className="ok" title={say("game.confirmedTitle")}>{"✓ " + say("game.confirmed")}</span> : null}
        {g.checked === -1 ? <span className="bad" title={say("game.disputedTitle")}>{"≠ " + say("game.disputed")}</span> : null}
        <Link href={page} prefetch={false} className="viewgame" title={title}>{say("gm.viewGame")}</Link>
      </div>
    </li>
  );
}

/** A league's scoreboard for one day: every game with its score, the days around it, and the controls to move. */
export async function Scoreboard({ lg, day }: { lg: LeagueCode; day: string }) {
  const { say, plural, dt } = await currentSpeaker();
  const eyebrow = <span className="eyebrow"><Link href={`/${lg}`}>{LG[lg]}</Link></span>;
  let data: Awaited<ReturnType<typeof loadScores>>, brands: Brands, seasons: Awaited<ReturnType<typeof getSummary>>["seasons"];
  try {
    [data, brands, { seasons }] = await Promise.all([loadScores(lg, day), getBrands(), getSummary()]);
  } catch {
    return <><AccentStyle league={lg} /><section className="head fade">{eyebrow}<h1>{say("scores.title")}</h1></section><p className="note">{say("load.failed")}</p></>;
  }
  const { games, around, bounds, before, after, year, days } = data;
  const at = atUtc(day);
  const first = bounds?.first.game_date ?? day, last = bounds?.last.game_date ?? day;
  const prev = addDay(day, -1), next = addDay(day, 1);
  const weekBack = addDay(day, -7), weekForward = addDay(day, 7);
  const upcoming = day >= addDay(todayUtc(), -1);
  const strip = [-3, -2, -1, 0, 1, 2, 3].map((n) => {
    const d = addDay(day, n);
    return { d, n: around.filter((g) => g.game_date === d).length };
  });
  const years = seasons.filter((s) => s.league === lg && s.games > 0).map((s) => s.year).sort((a, b) => b - a);
  const nearest = [
    before ? { d: before, text: say("scores.earlier", { date: dt.short(atUtc(before)) }) } : null,
    after ? { d: after, text: say("scores.later", { date: dt.short(atUtc(after)) }) } : null,
  ].filter((x) => x != null);
  return (
    <>
      <AccentStyle league={lg} />
      <section className="head fade">
        {eyebrow}
        <h1>{say("scores.title")}</h1>
        <p className="lede">{dt.full(at)}{say("sentence.sep")}{plural("count.games", games.length)}</p>
        <ScoresBar lg={lg} day={day} year={year} seasons={years} days={days} min={first} max={last}
          prev={day > first ? prev : ""} next={day < last ? next : ""} prevText={dt.monthDayShort(atUtc(prev))} nextText={dt.monthDayShort(atUtc(next))} />
      </section>
      <DayStrip aria={say("scores.daysAria")} current={day} jump={{ back: weekBack >= first ? scoresPath(lg, weekBack) : "", forward: weekForward <= last ? scoresPath(lg, weekForward) : "" }} days={strip.map(({ d, n }) => ({
        key: d, weekday: dt.weekdays[atUtc(d).getUTCDay()], date: dt.monthDayShort(atUtc(d)), games: n, word: plural("scores.gamesWord", n),
        label: `${dt.full(atUtc(d))}: ${plural("count.games", n)}`, href: scoresPath(lg, d),
      }))} />
      <section className="section">
        {games.length ? (
          <ul className="scoreboard">
            {games.map((g) => <Game key={g.game_id} lg={lg} g={g} brands={brands} say={say} upcoming={upcoming} />)}
          </ul>
        ) : (
          <div className="noday">
            <p><b>{say("scores.none", { league: LG[lg], date: dt.full(at) })}</b></p>
            {day < first ? <p className="note">{say("scores.beforeData", { league: LG[lg], date: dt.ymd(atUtc(first)) })}</p> : null}
            {day > last ? <p className="note">{say("scores.afterData", { league: LG[lg], date: dt.ymd(atUtc(last)) })}</p> : null}
            {nearest.length ? (
              <>
                <p className="note">{say("scores.nearest")}</p>
                <ul className="nearest">
                  {nearest.map((x) => <li key={x.d}><Link href={scoresPath(lg, x.d)} prefetch={false}>{x.text}</Link></li>)}
                </ul>
              </>
            ) : null}
          </div>
        )}
      </section>
    </>
  );
}
