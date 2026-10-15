"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import type { AbbrMap } from "@/lib/abbr";
import { atUtc, localToday } from "@/lib/format";
import type { GameTuple } from "@/lib/season";
import { scoresPath } from "@/lib/scores";
import { weekOf, type WeekMode } from "@/lib/weekStrip";
import { DayStrip } from "./DayStrip";
import { GameRow } from "./GameCalendar";
import { useSpeaker } from "./i18n/LocaleProvider";
import { useSeasonGames } from "./SeasonGamesData";
import "./scores.css";
import "./team.css";
import "./game.css";

const HEADING: Record<WeekMode, "season.weekLive" | "season.weekFirst" | "season.weekPast" | "season.weekLast"> = {
  today: "season.weekLive", first: "season.weekFirst", playoffs: "season.weekPast", last: "season.weekLast",
};

/**
 * Seven days of a season as the scores page's day strip, with that day's games shown in place beneath it: a season being played is centred on today (the
 * reader's own day, known only in the browser), a finished one shows its last seven playoff game days, ending with the final. A day's games are compact rows,
 * each leading to its game page, with a link to the full scores of that day. The strip uses the season's games, which the page fetches once (components/SeasonGamesData.tsx); until they come its place is held.
 */
export function SeasonWeek({ lg, abbrs, year, complete }: { lg: string; abbrs: AbbrMap; year: number; complete: boolean }) {
  const { say, plural, dt } = useSpeaker();
  const { ready, games, teams } = useSeasonGames();
  const today = useSyncExternalStore(() => () => {}, localToday, () => "");
  const [picked, setPicked] = useState("");
  const week = useMemo(() => weekOf(games.map((g) => ({ date: g[0], phase: g[5] })), complete, today), [games, complete, today]);
  const byDay = useMemo(() => {
    const m = new Map<string, GameTuple[]>();
    for (const g of games) { const l = m.get(g[0]); if (l) l.push(g); else m.set(g[0], [g]); }
    return m;
  }, [games]);
  // A season being played waits for the reader's day: until it is known the place is held (the page is drawn once for everyone, without it).
  if (!ready || (!complete && !today)) return <section className="section weekstrip pending" aria-hidden="true" />;
  if (!week) return null;
  const chosen = picked && week.days.includes(picked) ? picked : week.chosen;
  const list = byDay.get(chosen) ?? [];
  const days = week.days.map((d) => {
    const n = byDay.get(d)?.length ?? 0;
    return { key: d, weekday: dt.weekdays[atUtc(d).getUTCDay()], date: dt.monthDayShort(atUtc(d)), games: n, word: plural("scores.gamesWord", n), label: `${dt.full(atUtc(d))}: ${plural("count.games", n)}` };
  });
  return (
    <section className="section weekstrip">
      <h2>{say(HEADING[week.mode])}</h2>
      <DayStrip aria={say("scores.daysAria")} current={chosen} days={days} onPick={setPicked} />
      <p className="note">
        {say("cal.dayNote", { date: dt.full(atUtc(chosen)), games: plural("count.games", list.length) })}
        <Link href={scoresPath(lg, chosen)} prefetch={false}>{say("season.weekFull")}</Link>
      </p>
      {list.length ? (
        <div className="games weekgames">
          {list.map((g, i) => <GameRow key={i} lg={lg} g={g} teams={teams} year={year} abbrs={abbrs} />)}
        </div>
      ) : null}
    </section>
  );
}
