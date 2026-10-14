import { getAbbrs } from "@/lib/data";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard } from "@/lib/loadGuard";
import { loadPlayoffs } from "@/lib/playoffs";
import { roundSay } from "@/lib/roundWords";
import { sportOf } from "@/lib/gameSurface";
import { GameSurface } from "./GameSurface";

/**
 * The game that decided a season's championship, on its surface: the last game of the final, when the final is a series the games settle and its winner is
 * the season's champion. Draws nothing for a league with no surface of its own, a season with no final in the games, or a winner that is not the champion on record.
 */
export const ChampionSurface = guard(async function ChampionSurface({ lg, year, champion }: { lg: string; year: number; champion: number | null | undefined }) {
  if (!sportOf(lg) || champion == null) return null;
  const sp = await currentSpeaker();
  const say = roundSay(sp);
  const [{ series, names, bracket, brands }, abbrs] = await Promise.all([loadPlayoffs(lg, year, say), getAbbrs(lg)]);
  const fin = bracket.finalIndex != null ? series[bracket.finalIndex] : null;
  if (!fin || fin.live || fin.winner == null || fin.sides[fin.winner].f !== champion) return null;
  const last = fin.games.filter((g) => g.played && g.score[0] != null && g.score[1] != null).at(-1);
  if (!last) return null;
  const [home, away] = [fin.sides[last.home], fin.sides[last.home === 0 ? 1 : 0]];
  const single = fin.games.length === 1;
  const name = names.at(-1) ?? "";
  return (
    <GameSurface
      lg={lg} year={year} brands={brands} abbrs={abbrs}
      competition={single ? name : `${name} · ${say("games.gameN", { n: sp.fmt(last.n) })}`}
      game={{
        id: last.id, date: last.date, phase: "playoffs", final: true, overtime: last.ot,
        home: { f: home.f, name: home.name, score: last.score[last.home] },
        away: { f: away.f, name: away.name, score: last.score[last.home === 0 ? 1 : 0] },
      }}
    />
  );
}, () => null);
