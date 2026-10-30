import { PostseasonTable, type PostLine } from "@/components/PostseasonTable";
import type { BrandMap } from "@/lib/brand";
import { logoFor } from "@/lib/brand";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { bowlName, groupOf, isVacated, playoffRound, POST_GROUPS, roundTag, titleGame, titleGameOf, type PostGame, type PostGroupId } from "@/lib/postseason";
import type { GameTuple } from "@/lib/season";
import "./alignment.css";

interface Team { id: number; f: number | null; name: string | null }

/**
 * A season's postseason for a league that tells it as games (college football): the national championship game first, then the College Football Playoff,
 * the other bowl games and the conference championship games, each with the name the archive holds. The champion's note names the title game; a title the
 * NCAA vacated is said so. Draws nothing for a season with no such game, or while api.game_round is missing on the database.
 */
export async function SeasonPostseason({ lg, year, games, teams, rounds, brands, championNote }: {
  lg: string; year: number; games: GameTuple[]; teams: Team[]; rounds: ReadonlyMap<number, string>; brands: BrandMap; championNote: string | null;
}) {
  const sp = await currentSpeaker();
  const { say, fmt } = sp;
  const byId = new Map(teams.map((t) => [t.id, t]));
  const side = (id: number, score: number | null): PostGame["a"] => ({ id, f: byId.get(id)?.f ?? null, name: byId.get(id)?.name ?? "—", score });
  const all: PostGame[] = games.filter((g) => g[6] === "f").map((g) => ({
    id: g[10], date: g[0], phase: g[5], label: rounds.get(g[10]) ?? null, a: side(g[1], g[2]), b: side(g[4], g[3]),
  }));
  const titleLabel = titleGameOf(championNote);
  const title = titleGame(all, titleLabel);
  const group = (g: PostGame): PostGroupId | null => (g === title ? "title" : groupOf(g, titleLabel) === "title" ? "bowl" : groupOf(g, titleLabel));
  const shown = all.flatMap((g) => { const k = group(g); return k ? [{ g, k }] : []; });
  // A postseason game with no label (the archive names the bowl for most games, not all) is a bowl game all the same.
  if (!shown.length) return null;

  const nameOf = (g: PostGame, k: PostGroupId) => {
    if (k === "title") return g.label ? bowlName(g.label) || g.label : say("post.titleGame");
    const tag = k === "playoff" ? roundTag(g.label) : "";
    return `${g.label ? bowlName(g.label) || g.label : say("post.unnamed")}${tag ? ` · ${tag}` : ""}`;
  };
  const rank = (k: PostGroupId) => POST_GROUPS.indexOf(k);
  const rows = [...shown].sort((x, y) => rank(x.k) - rank(y.k) || (x.k === "playoff" ? playoffRound(x.g.label) - playoffRound(y.g.label) : 0) || (x.g.date < y.g.date ? -1 : x.g.date > y.g.date ? 1 : x.g.id - y.g.id));
  // The table is drawn in the browser from short lines; a logo's address is long and a club's is on several rows, so the lines point into one list.
  const logos: string[] = [];
  const logoAt = (f: number | null) => { const u = logoFor(brands, f, year); return u ? (logos.indexOf(u) >= 0 ? logos.indexOf(u) : logos.push(u) - 1) : -1; };
  const asSide = (s: PostGame["a"]): PostLine["a"] => [s.f, s.name, s.score ?? 0, logoAt(s.f)];
  const lines: PostLine[] = rows.map(({ g, k }) => ({ id: g.id, d: g.date, n: nameOf(g, k), k, a: asSide(g.a), b: asSide(g.b) }));
  const present = POST_GROUPS.filter((k) => rows.some((r) => r.k === k));
  const sub = (k: PostGroupId) => `${fmt(rows.filter((r) => r.k === k).length)}`;
  return (
    <section className="section" id="postseason">
      <h2>{say("post.title")}</h2>
      <p className="note">
        {say("post.note")}
        {isVacated(championNote) ? ` ${say("post.vacated")}` : ""}
      </p>
      <div className="scroll">
        <PostseasonTable lg={lg} year={year} lines={lines} logos={logos} groups={present.map((k) => ({ id: k, title: say(`post.group.${k}`), sub: sub(k) }))} />
      </div>
    </section>
  );
}
