import type { SeasonNoteRow, StandingRow } from "./api/types";
import type { Speaker } from "./i18n/i18n";

/**
 * The usual length of a league's season: the games count most teams share, when at least half the teams share it.
 * An unfinished season (no champion yet) has none.
 */
export function usualGames(gps: number[], complete: boolean): number | null {
  if (!complete || !gps.length) return null;
  const n = new Map<number, number>();
  for (const g of gps) n.set(g, (n.get(g) ?? 0) + 1);
  const [mode, count] = [...n].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  return count * 2 >= gps.length ? mode : null;
}

export interface ScheduleNote { text: string; src: string | null }

const noteText = (n: SeasonNoteRow, locale: Speaker["locale"]) => (locale === "fr" ? n.note_fr : locale === "ja" ? n.note_ja : null) ?? n.note_en;

/**
 * Why a schedule has fewer games than a full season, or null when it does not. A season with a database note (see api.season_note)
 * gives the reason and the games planned; any other season is compared with the usual length. A team that played under half of it
 * (a team that folded, a gap in the data) is not called short. With `team` it is that team's note, otherwise the season's.
 */
export function scheduleNote(sp: Pick<Speaker, "say" | "plural" | "locale">, notes: SeasonNoteRow[], lg: string, year: number, standings: StandingRow[], complete: boolean, team?: { name: string; played: number | null; franchise: number }): ScheduleNote | null {
  const { say, plural, locale } = sp;
  const gps = standings.map((r) => r.gp ?? 0).filter((g) => g > 0);
  const typed = notes.find((n) => n.franchise_id == null && n.league === lg && n.year === year);
  const own = team ? notes.find((n) => n.franchise_id === team.franchise && n.league === lg && n.year === year) : undefined;
  const planned = typed?.games_planned ?? null;
  const target = planned ?? usualGames(gps, complete);
  if (target == null && !own) return null;
  const parts: string[] = [];
  if (typed) {
    parts.push(noteText(typed, locale));
    if (planned != null && typed.games_usual != null && planned < typed.games_usual) parts.push(say("sched.fewer", { games: planned, usual: typed.games_usual }));
  }
  if (own) parts.push(noteText(own, locale));
  if (target != null) {
    if (team) {
      const p = team.played;
      if (p != null && p < target && p * 2 >= target) parts.push(say(typed ? "sched.teamPlayed" : "sched.teamUsual", { team: team.name, played: p, games: target }));
    } else {
      const real = gps.filter((g) => g * 2 >= target);
      const min = Math.min(...real);
      if (real.length && min < target) {
        if (typed) parts.push(say("sched.range", { min, max: Math.max(...real), games: target }));
        else parts.push(plural("sched.fewTeams", real.filter((g) => g < target).length, { usual: target, min }));
      }
    }
  }
  if (!parts.length) return null;
  return { text: parts.join(say("sentence.gap")), src: (own ?? typed)?.source_url ?? null };
}
