import type { Locale } from "@/lib/locale";

/**
 * Positions are codes from a fixed list per league (ref.position, served by api.position): NHL C, LW, RW, F, D, G; MLB P, C, 1B, SS, ...;
 * NFL and CFL QB, RB, WR, ... Tables show the short code; the player page shows the name in the reader's language.
 */
export interface PositionRow {
  league: string;
  code: string;
  sort: number;
  group: string;
  name_en: string;
  name_fr: string;
  name_ja: string;
}

/** What an older address or API call may say instead of a code (the words the archive used before the fixed lists), lower case. */
const WORDS: Record<string, string> = {
  c: "C", centre: "C", center: "C", catcher: "C",
  l: "LW", lw: "LW", "left wing": "LW", "left winger": "LW",
  r: "RW", rw: "RW", "right wing": "RW", "right winger": "RW",
  d: "D", defenseman: "D", defenceman: "D", defender: "D",
  g: "G", goaltender: "G", goalie: "G", guard: "G",
  pitcher: "P", "starting pitcher": "P", "relief pitcher": "P", closer: "P", punter: "P",
  "first baseman": "1B", "second baseman": "2B", "third baseman": "3B", shortstop: "SS",
  "left fielder": "LF", "center fielder": "CF", "right fielder": "RF", outfielder: "OF", infielder: "IF", "designated hitter": "DH", "two-way player": "TWP",
  "point guard": "PG", "shooting guard": "SG", "small forward": "SF", "power forward": "PF", forward: "F",
  quarterback: "QB", "running back": "RB", halfback: "RB", fullback: "FB", "wide receiver": "WR", "tight end": "TE", tackle: "T",
  "offensive tackle": "T", linebacker: "LB", "defensive end": "DE", "defensive tackle": "DT", "defensive lineman": "DL", "defensive back": "DB",
  cornerback: "CB", safety: "S", placekicker: "K", kicker: "K", slotback: "SB",
};

/**
 * The code a position text means: a code is returned as it is (upper case); an older word ("Defenseman", "left winger") as its code;
 * anything else null. Used so old addresses such as `?position=Defenseman` keep working.
 */
export function positionCode(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const word = WORDS[t.toLowerCase()];
  if (word) return word;
  return /^[A-Za-z0-9]{1,3}(-[A-Za-z0-9]{1,3})?$/.test(t) ? t.toUpperCase() : null;
}

/** The codes of a person, the main one first, each once: from the list when it has one, else the main position alone. Older words become their codes. */
export function positionCodes(positions: readonly string[] | null | undefined, position?: string | null): string[] {
  const list = positions?.length ? positions : position ? [position] : [];
  return [...new Set(list.map((p) => positionCode(p) ?? p.trim()).filter(Boolean))];
}

/**
 * The one separator between a person's positions, everywhere: "C/LW". The components draw it between the codes (PositionList) and every
 * plain-text form joins with it too, so no page spells a list its own way. Never join positions by hand (scripts/positions.test.ts scans for it).
 */
export const POSITION_SEP = "/";

/** The id of the key at the bottom of a page; every position code links to it. */
export const POSITIONS_KEY_ID = "positions-key";

/** The short form for a table cell or a plain text: "C/LW", the main position first; empty when the person has none. */
export function positionsShort(positions: readonly string[] | null | undefined, position?: string | null): string {
  return positionCodes(positions, position).join(POSITION_SEP);
}

const NAME = { en: "name_en", fr: "name_fr", ja: "name_ja" } as const;

/**
 * The names of a person's positions in the reader's language, "Pitcher / Designated hitter". The league of the page picks the list
 * (C is a centre in the NHL and a catcher in MLB); a code that list lacks is looked up in the others, and one nobody holds is shown as it is.
 */
export function positionNames(codes: readonly string[], league: string | null, list: readonly PositionRow[], locale: Locale): string {
  const key = NAME[locale];
  return codes.map((c) => {
    const hit = list.find((r) => r.code === c && r.league === league) ?? list.find((r) => r.code === c);
    return hit ? hit[key] : c;
  }).join(" / ");
}

/**
 * Soccer's codes are not in api.position (the archive sends only the code and an English word), so the names of those it uses live here:
 * the squad's four lines and the match line-ups' finer ones. French and Japanese are best guesses (web/I18N_TODO.md).
 */
const soccer = (sort: number, code: string, name_en: string, name_fr: string, name_ja: string, group: string): PositionRow => ({ league: "soccer", code, sort, group, name_en, name_fr, name_ja });
export const SOCCER_POSITIONS: readonly PositionRow[] = [
  soccer(1, "GK", "Goalkeeper", "Gardien de but", "ゴールキーパー", "goalkeeper"),
  soccer(2, "DF", "Defender", "Défenseur", "ディフェンダー", "defender"),
  soccer(3, "CB", "Center back", "Défenseur central", "センターバック", "defender"),
  soccer(4, "LB", "Left back", "Arrière gauche", "左サイドバック", "defender"),
  soccer(5, "RB", "Right back", "Arrière droit", "右サイドバック", "defender"),
  soccer(6, "MF", "Midfielder", "Milieu de terrain", "ミッドフィールダー", "midfielder"),
  soccer(7, "DM", "Defensive midfielder", "Milieu défensif", "守備的ミッドフィールダー", "midfielder"),
  soccer(8, "CM", "Center midfielder", "Milieu central", "センターミッドフィールダー", "midfielder"),
  soccer(9, "LM", "Left midfielder", "Milieu gauche", "左ミッドフィールダー", "midfielder"),
  soccer(10, "RM", "Right midfielder", "Milieu droit", "右ミッドフィールダー", "midfielder"),
  soccer(11, "AM", "Attacking midfielder", "Milieu offensif", "攻撃的ミッドフィールダー", "midfielder"),
  soccer(12, "FW", "Forward", "Attaquant", "フォワード", "forward"),
  soccer(13, "CF", "Center forward", "Avant-centre", "センターフォワード", "forward"),
  soccer(14, "LF", "Left forward", "Attaquant gauche", "左フォワード", "forward"),
  soccer(15, "RF", "Right forward", "Attaquant droit", "右フォワード", "forward"),
  soccer(16, "LW", "Left winger", "Ailier gauche", "左ウイング", "forward"),
  soccer(17, "RW", "Right winger", "Ailier droit", "右ウイング", "forward"),
  soccer(18, "SS", "Second striker", "Second attaquant", "セカンドストライカー", "forward"),
];

/** The order the leagues are listed in a key. */
const LEAGUE_ORDER = ["nhl", "nba", "mlb", "nfl", "cfl", "soccer"];
const leagueRank = (l: string | null): number => (l == null ? 99 : LEAGUE_ORDER.includes(l) ? LEAGUE_ORDER.indexOf(l) : 50);

/** One position as a page draws it: the code and the league whose list explains it (C is a centre in the NHL and a catcher in MLB). */
export interface PositionUse {
  league: string | null;
  code: string;
}

const everything = (list: readonly PositionRow[]): readonly PositionRow[] => [...list, ...SOCCER_POSITIONS];

/**
 * The league whose list explains a code for someone who played in `leagues` (the page's own league first): the first of them that holds the code,
 * else the first league that holds it at all, else null (a code nobody lists is shown with no name).
 */
export function resolveLeague(code: string, leagues: readonly string[], list: readonly PositionRow[]): string | null {
  const all = everything(list);
  const mine = leagues.find((l) => all.some((r) => r.league === l && r.code === code));
  return mine ?? all.find((r) => r.code === code)?.league ?? null;
}

/** The name of a code in a league's list in the reader's language; null when that list lacks it. */
export function positionName(code: string, league: string | null, list: readonly PositionRow[], locale: Locale): string | null {
  const hit = everything(list).find((r) => r.code === code && r.league === league);
  return hit ? hit[NAME[locale]] : null;
}

/** One league's part of a key: the codes that appear on the page and what they mean, in the league's own order. */
export interface KeyGroup {
  league: string;
  items: { code: string; name: string }[];
}

/**
 * The key of a page: each code the page uses, once, with its name, grouped by league (in a fixed league order) so codes that collide across sports
 * (C, G, P, S, ...) are each explained under their own league. A page of one league gives one group. A code with no name in any list is left out.
 */
export function keyGroups(uses: readonly PositionUse[], list: readonly PositionRow[], locale: Locale): KeyGroup[] {
  const seen = new Set<string>();
  const byLeague = new Map<string, PositionRow[]>();
  const all = everything(list);
  for (const u of uses) {
    if (u.league == null) continue;
    const id = `${u.league}|${u.code}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const row = all.find((r) => r.league === u.league && r.code === u.code);
    if (row) byLeague.set(u.league, [...(byLeague.get(u.league) ?? []), row]);
  }
  return [...byLeague.entries()]
    .sort(([a], [b]) => leagueRank(a) - leagueRank(b) || a.localeCompare(b))
    .map(([league, rows]) => ({
      league,
      items: rows.sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code)).map((r) => ({ code: r.code, name: r[NAME[locale]] })),
    }));
}
