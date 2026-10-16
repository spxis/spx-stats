import "server-only";
import type { Metadata } from "next";
import { cache } from "react";
import { getGameBounds, getGameDay, getGamesBetween, getSeasonDays, getSeasonLastDay } from "./data";
import { atUtc } from "./format";
import { currentSpeaker } from "./i18n/currentLocale";
import { LG, type LeagueCode } from "./leagues";
import { pageMeta } from "./meta";
import { addDay, scoresPath, todayUtc } from "./scores";
import { stripDates } from "./weekStrip";

/** The day /lg/scores opens on: today's games, else the latest game day before today (the first day if the league has none yet). */
export async function defaultDay(lg: string): Promise<string | null> {
  const bounds = await getGameBounds(lg);
  if (!bounds) return null;
  const today = todayUtc();
  if (today < bounds.first.game_date) return bounds.first.game_date;
  if (today >= bounds.last.game_date) return bounds.last.game_date;
  return (await getGameDay(lg, addDay(today, 1), "before"))?.game_date ?? bounds.first.game_date;
}

/** The day a season's scores open on: the last game day of a finished season, else the default day (the season is on now). */
export async function seasonDay(lg: string, y: number): Promise<string | null> {
  const last = await getSeasonLastDay(lg, y);
  if (!last) return null;
  return last > todayUtc() ? defaultDay(lg) : last;
}

/**
 * Everything the scoreboard of a day needs from the games: that day's games, the days around it, the nearest game days
 * either side when the day is empty, the league's first and last day, and the days of the season the day belongs to.
 */
export const loadScores = cache(async (lg: string, day: string) => {
  const window = stripDates(day);
  const from = window[0], to = window[window.length - 1];
  const [around, bounds] = await Promise.all([getGamesBetween(lg, from, to), getGameBounds(lg)]);
  const games = around.filter((g) => g.game_date === day);
  const [before, after] = games.length ? [null, null] : await Promise.all([getGameDay(lg, day, "before"), getGameDay(lg, day, "after")]);
  const nearest = around.reduce<(typeof around)[number] | null>((best, game) => {
    if (!best) return game;
    const distance = Math.abs(Date.parse(`${game.game_date}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`));
    const bestDistance = Math.abs(Date.parse(`${best.game_date}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`));
    return distance < bestDistance ? game : best;
  }, null);
  const year = games[0]?.year ?? nearest?.year ?? before?.year ?? after?.year ?? null;
  const days = year != null ? await getSeasonDays(lg, year) : [];
  return { games, around, bounds, before: before?.game_date ?? null, after: after?.game_date ?? null, year, days };
});

/** The head of a scoreboard page: a day with no games is kept out of search results. */
export async function scoresMeta(lg: LeagueCode, day: string): Promise<Metadata> {
  const { say, plural, dt, locale } = await currentSpeaker();
  const date = dt.full(atUtc(day));
  let n = 0;
  try { n = (await loadScores(lg, day)).games.length; } catch { return {}; }
  return {
    ...pageMeta({
      title: say("scores.metaTitle", { league: LG[lg], date }),
      description: n ? say("scores.metaDesc", { league: LG[lg], date, games: plural("count.games", n) }) : say("scores.none", { league: LG[lg], date }),
      path: scoresPath(lg, day),
      locale,
    }),
    ...(n ? {} : { robots: { index: false } }),
  };
}
