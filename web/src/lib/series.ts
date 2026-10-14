/**
 * Playoff series, worked out from the games: no table holds them. A series is the playoff games one pair of
 * franchises played in a season; the wins of each side, the running score and the winner are counted here.
 * Pure (no server-only imports) so the pages, the charts and the checks all use the same counting.
 */
import type { Tie, TiePlay } from "./bracketLayout.ts";
import type { GameRow } from "./api/types";
import { LG, type LeagueCode } from "./leagues.ts";
import { bestOfFromGames, bestOfIn, roundKeys, winsNeeded, type RoundKey } from "./playoffFormat.ts";
import type { Say, SeriesKey } from "./seriesCopy.ts";
import { seasonPath, type TeamPaths } from "./slug.ts";

/** The columns of a game a series needs. */
export type PlayoffGame = Pick<GameRow, "game_id" | "game_date" | "status" | "away_id" | "away" | "away_score" | "home_id" | "home" | "home_score" | "overtime" | "source" | "away_f" | "home_f" | "checked">;

export interface SeriesSide {
  /** Franchise id. */
  f: number;
  /** The team's id in this season (its team-season). */
  id: number;
  name: string;
  /** Games won. */
  wins: number;
  /** Goals, runs or points scored over the series. */
  scored: number;
}

export interface SeriesGame {
  id: number;
  date: string;
  /** 1-based, in the order played. */
  n: number;
  /** Which side (0 or 1) was at home. */
  home: 0 | 1;
  /** What each side scored (null with no result). */
  score: [number | null, number | null];
  ot: boolean;
  /** Whether it has been played (a final result on record); a game still to come has no score. */
  played: boolean;
  /** A game still to come that is not needed yet: the series cannot reach it before the games ahead of it are played. */
  ifNeeded: boolean;
  /** The side that won it; null for a tie or no result. */
  winner: 0 | 1 | null;
  /** Wins of each side after this game. */
  run: [number, number];
  source: string;
  checked: number | null;
}

export interface Series {
  league: string;
  year: number;
  /**
   * The winner first; a series still being played has the side ahead first (the lower franchise id when level), and a series
   * nobody has won in the data has the lower franchise id first.
   */
  sides: [SeriesSide, SeriesSide];
  /** The games played, and (while the series is in progress) the games still to come. */
  games: SeriesGame[];
  ties: number;
  /** The side that won it. Null while the series is in progress, and when the games do not settle it. */
  winner: 0 | 1 | null;
  /** Still being played: games remain and neither side has the wins needed. It has no winner, and nobody is out. */
  live: boolean;
  /** Games the series is played to (best of N): the round's known format, else read off the games it has. */
  bestOf: number;
  /** Wins that settle it: half of N, rounded up. */
  needed: number;
  /** Games still to come (0 once the series is decided). */
  remaining: number;
  /** The date of the next game still to come, while the series is in progress. */
  next: string | null;
  /** How it was settled: more games won, or (a total-goals series) more goals over the games. */
  basis: "wins" | "goals" | null;
  start: string;
  end: string;
  /** 1 for the first time the pair met in these playoffs; 2 for a second series (the 2020 NHL round robin, for one). */
  meeting: number;
}

export const pairSlug = (a: number, b: number, meeting = 1): string => `${a}-vs-${b}${meeting > 1 ? `-${meeting}` : ""}`;
/** The address segment of a series: the two teams as they were called that season, `boston-bruins-vs-florida-panthers` (and `-2` for their second series of the year). */
export const pairSegment = (paths: TeamPaths, lg: string, year: number, a: number, b: number, meeting = 1): string =>
  `${paths.season(lg, a, year)}-vs-${paths.season(lg, b, year)}${meeting > 1 ? `-${meeting}` : ""}`;
export const seriesPath = (paths: TeamPaths, lg: string, year: number, s: Pick<Series, "sides" | "meeting">): string =>
  `${seasonPath(lg, year)}/series/${pairSegment(paths, lg, year, s.sides[0].f, s.sides[1].f, s.meeting)}`;

/** Days apart at which one pair's games stop being the same series. */
const SERIES_GAP_DAYS = 12;
/** Series decided on total goals were played in the NHL's first twenty years of playoffs; anywhere else a tie on wins is left open. */
const totalGoalsEra = (league: string, year: number) => league === "nhl" && year <= 1941;
const dayNumber = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;

const byDate = (x: { game_date: string; game_id: number }, y: { game_date: string; game_id: number }) =>
  x.game_date < y.game_date ? -1 : x.game_date > y.game_date ? 1 : x.game_id - y.game_id;

/** A scheduled game this many days older than the latest result in the data was never played (a series the data cut short); it is left out. */
const STALE_DAYS = 7;

export interface SeriesOptions {
  /** The games the series is played to, when the round's format is known; otherwise it is read off the games listed. */
  bestOf?: number | null;
  /** The date of the latest result of the season (or of the games given, if omitted): older unplayed games are ignored. */
  asOf?: string | null;
}

const latestResult = (games: readonly PlayoffGame[]): string | null =>
  games.reduce<string | null>((m, g) => (g.status === "final" && (m == null || g.game_date > m) ? g.game_date : m), null);

/**
 * One series from the games of a pair (any order), or null when the list has none between two known franchises.
 *
 * A series is decided when a side has the wins needed (best of N needs half of N rounded up), or when no game is left to
 * play. Until then it is in progress (`live`): it has no winner, nobody is out, and the games still to come are listed.
 */
export function buildSeries(league: string, year: number, games: readonly PlayoffGame[], meeting = 1, opts: SeriesOptions = {}): Series | null {
  const list = games.filter((g) => g.home_f != null && g.away_f != null && g.home_f !== g.away_f).sort(byDate);
  if (!list.length) return null;
  const f0 = Math.min(list[0].home_f!, list[0].away_f!), f1 = Math.max(list[0].home_f!, list[0].away_f!);
  const pair = list.filter((g) => Math.min(g.home_f!, g.away_f!) === f0 && Math.max(g.home_f!, g.away_f!) === f1);
  if (!pair.length) return null;

  // Games with a result, and games still to come. A cancelled game, and a scheduled one long past the season's latest result, are neither.
  const asOf = opts.asOf ?? latestResult(list);
  const fresh = (g: PlayoffGame) => g.status === "scheduled" && (asOf == null || dayNumber(g.game_date) >= dayNumber(asOf) - STALE_DAYS);
  const finals = pair.filter((g) => g.status === "final");
  const pending = pair.filter(fresh);
  if (!finals.length && !pending.length) return null;

  const bestOf = opts.bestOf ?? bestOfFromGames(finals.length + pending.length);
  const needed = winsNeeded(bestOf);

  const nameOf = (f: number) => {
    const g = pair.find((x) => x.home_f === f) ?? pair.find((x) => x.away_f === f)!;
    return g.home_f === f ? { id: g.home_id, name: g.home ?? `Team ${f}` } : { id: g.away_id, name: g.away ?? `Team ${f}` };
  };
  const base = (f: number): SeriesSide => ({ f, ...nameOf(f), wins: 0, scored: 0 });
  let sides: [SeriesSide, SeriesSide] = [base(f0), base(f1)];
  const idx = (f: number): 0 | 1 => (f === sides[0].f ? 0 : 1);

  let ties = 0;
  for (const g of finals) {
    if (g.home_score == null || g.away_score == null) continue;
    const h = idx(g.home_f!), a = idx(g.away_f!);
    sides[h].scored += g.home_score;
    sides[a].scored += g.away_score;
    if (g.home_score > g.away_score) sides[h].wins++; else if (g.home_score < g.away_score) sides[a].wins++; else ties++;
  }
  const clinched = Math.max(sides[0].wins, sides[1].wins) >= needed;
  const live = pending.length > 0 && !clinched;

  let winner: 0 | 1 | null = null;
  let basis: Series["basis"] = null;
  if (!live) {
    if (sides[0].wins !== sides[1].wins) { winner = sides[0].wins > sides[1].wins ? 0 : 1; basis = "wins"; }
    else if (totalGoalsEra(league, year) && sides[0].scored !== sides[1].scored && sides[0].wins + sides[1].wins + ties > 0) { winner = sides[0].scored > sides[1].scored ? 0 : 1; basis = "goals"; }
  }
  // Counted in franchise order above; from here on the winner (or, in progress, the side ahead) is side 0.
  if (winner === 1 || (live && sides[1].wins > sides[0].wins)) sides = [sides[1], sides[0]];
  if (winner === 1) winner = 0;

  // A decided series lists the games played; one in progress lists the games to come as well.
  const shown = (live ? [...finals, ...pending] : finals).sort(byDate);
  const leaderWins = Math.max(sides[0].wins, sides[1].wins);
  const lastNeeded = finals.length + Math.max(needed - leaderWins, 0);
  const out: SeriesGame[] = [];
  const run: [number, number] = [0, 0];
  shown.forEach((g, i) => {
    const homeIdx = idx(g.home_f!);
    const played = g.status === "final";
    const fin = played && g.home_score != null && g.away_score != null;
    const score: [number | null, number | null] = [null, null];
    if (fin) { score[homeIdx] = g.home_score; score[idx(g.away_f!)] = g.away_score; }
    let w: 0 | 1 | null = null;
    if (fin && g.home_score !== g.away_score) w = (g.home_score! > g.away_score!) === (homeIdx === 0) ? 0 : 1;
    if (w != null) run[w]++;
    out.push({ id: g.game_id, date: g.game_date, n: i + 1, home: homeIdx, score, ot: !!g.overtime, played, ifNeeded: !played && i + 1 > lastNeeded, winner: w, run: [run[0], run[1]], source: g.source, checked: g.checked });
  });
  return {
    league, year, sides, games: out, ties,
    winner,
    live,
    bestOf, needed,
    remaining: live ? pending.length : 0,
    next: live ? pending[0].game_date : null,
    basis,
    start: shown[0].game_date, end: shown[shown.length - 1].game_date, meeting,
  };
}

/** One pair's games split into the games of each separate series (a long gap starts a new one), in the order played. */
function splitMeetings(games: readonly PlayoffGame[]): PlayoffGame[][] {
  const list = games.filter((g) => g.home_f != null && g.away_f != null && g.home_f !== g.away_f).sort(byDate);
  const groups: PlayoffGame[][] = [];
  for (const g of list) {
    const last = groups.at(-1);
    if (last && dayNumber(g.game_date) - dayNumber(last[last.length - 1].game_date) <= SERIES_GAP_DAYS) last.push(g); else groups.push([g]);
  }
  return groups;
}

/** One pair's games split into the separate series they make up (a long gap starts a new one), in the order played. */
export function meetingsOf(league: string, year: number, games: readonly PlayoffGame[], asOf?: string | null): Series[] {
  return splitMeetings(games).map((l, i) => buildSeries(league, year, l, i + 1, { asOf })).filter((s): s is Series => s != null);
}

const bySeries = (a: Series, b: Series) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.end < b.end ? -1 : a.end > b.end ? 1 : a.sides[0].f - b.sides[0].f);

/**
 * Every series of a season's playoff games, in the order they began. A game with no result does not make a series.
 * Each series is first read with the games it has; then, once the rounds are known, a round with a known format
 * (best of 5, best of 7) settles its series by that format.
 */
export function deriveSeries(league: string, year: number, games: readonly PlayoffGame[]): Series[] {
  const by = new Map<string, PlayoffGame[]>();
  for (const g of games) {
    if (g.home_f == null || g.away_f == null || g.home_f === g.away_f) continue;
    const k = pairSlug(Math.min(g.home_f, g.away_f), Math.max(g.home_f, g.away_f));
    const l = by.get(k);
    if (l) l.push(g); else by.set(k, [g]);
  }
  const asOf = latestResult(games);
  const parts: { games: PlayoffGame[]; meeting: number; s: Series }[] = [];
  for (const list of by.values()) {
    splitMeetings(list).forEach((g, i) => {
      const s = buildSeries(league, year, g, i + 1, { asOf });
      if (s && s.games.some((x) => x.winner != null || x.score[0] != null)) parts.push({ games: g, meeting: i + 1, s });
    });
  }
  parts.sort((x, y) => bySeries(x.s, y.s));
  const first = parts.map((p) => p.s);
  const plan = planRounds(league, year, first, true);
  const keys = plan.keys;
  if (!keys) return first;
  return parts.map((p, i) => {
    const key = keys[plan.round[i] - 1];
    const known = key ? bestOfIn(league, year, key) : null;
    if (known == null || known === p.s.bestOf) return p.s;
    return buildSeries(league, year, p.games, p.meeting, { asOf, bestOf: known }) ?? p.s;
  });
}

/** The 2019-20 NHL restart seeded each conference with a round robin of single games; they are not part of the bracket (round 0). */
export const isRobin = (league: string, year: number, s: Series): boolean => league === "nhl" && year === 2019 && s.games.length === 1;

/** The round of each series: one more than the number of series either side had already played (a bye lets a side start later). Round-robin games are round 0. */
export function assignRounds(list: readonly Series[], robin: (s: Series) => boolean = () => false): number[] {
  const sorted = list.map((s, i) => ({ s, i })).sort((x, y) => (x.s.start < y.s.start ? -1 : x.s.start > y.s.start ? 1 : x.s.end < y.s.end ? -1 : x.s.end > y.s.end ? 1 : x.i - y.i));
  const played = new Map<number, number>();
  const round: number[] = new Array(list.length).fill(1);
  for (const { s, i } of sorted) {
    if (robin(s)) { round[i] = 0; continue; }
    const [a, b] = s.sides;
    round[i] = Math.max(played.get(a.f) ?? 0, played.get(b.f) ?? 0) + 1;
    // Two clubs that both had a bye start a round later than the single games (wild cards) already finished before them.
    if (round[i] === 1 && s.games.length > 1) for (const x of sorted) if (x.i !== i && round[x.i] > 0 && x.s.games.length === 1 && x.s.end < s.start) round[i] = Math.max(round[i], round[x.i] + 1);
    played.set(a.f, round[i]);
    played.set(b.f, round[i]);
  }
  return round;
}

const ROMAN: [number, string][] = [[50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
export const roman = (n: number): string => { let out = ""; for (const [v, r] of ROMAN) while (n >= v) { out += r; n -= v; } return out; };

/** What a league calls its last round. */
export function finalName(lg: string, year: number, say: Say): string {
  switch (lg) {
    case "nhl": return say("final.nhl");
    case "nba": return say("final.nba");
    case "mlb": return say("final.mlb");
    case "nfl": return year >= 1966 ? say("final.nfl", { numeral: roman(year - 1965) }) : say("final.nflOld");
    case "cfl": return say("final.cfl");
    default: return say("final.other");
  }
}

/** Names of the rounds by position from the end: the final, semifinals, quarterfinals, then Round 1, 2... */
export function roundName(lg: string, year: number, round: number, rounds: number, say: Say): string {
  const fromEnd = rounds - round;
  if (fromEnd === 0) return finalName(lg, year, say);
  if (fromEnd === 1) return say("round.semis");
  if (fromEnd === 2) return say("round.quarters");
  return say("round.n", { n: round });
}

/**
 * The rounds of a season: the round of each series (0 for a round robin), what each round is called (`keys`, round 1 first, null when the
 * league's format table has no row for this many rounds), and the number of the final (0 when the last round holds more than one series, or
 * is not the league's last round: a season still in its early rounds has no final yet).
 */
export function planRounds(lg: string, year: number, list: readonly Series[], assumeOpen = false): { round: number[]; keys: RoundKey[] | null; final: number; single: boolean } {
  const round = assignRounds(list, (s) => isRobin(lg, year, s));
  const count = Math.max(0, ...round);
  const last = list.filter((_, i) => round[i] === count);
  const single = last.length === 1;
  // Settled: the one series of the last round is decided and nothing else is being played. Otherwise more rounds may follow.
  // (`assumeOpen`: the series have only been read off their own games so far, so a lead that looks decided may not be.)
  const open = assumeOpen || !(single && !last[0].live) || list.some((s) => s.live);
  const keys = count ? roundKeys(lg, year, count, single, open) : null;
  const isFinal = single && (keys ? keys[count - 1] === "final" : true);
  return { round, keys, final: isFinal ? count : 0, single };
}

/** Every series with its round (0 for a round robin), the names of the rounds 1..n, and the number of the final (0 when there is none yet). */
export function describeRounds(lg: string, year: number, list: readonly Series[], say: Say): { round: number[]; names: string[]; final: number } {
  const { round, keys, final, single } = planRounds(lg, year, list);
  const count = Math.max(0, ...round);
  const names = Array.from({ length: count }, (_, i) => {
    const key = keys?.[i];
    if (key) return key === "final" ? finalName(lg, year, say) : say(ROUND_WORD[key]);
    return single ? roundName(lg, year, i + 1, count, say) : say("round.n", { n: i + 1 });
  });
  return { round, names, final };
}

/** The series word that names each round of the format table. */
const ROUND_WORD: Record<Exclude<RoundKey, "final">, SeriesKey> = {
  first: "round.first", second: "round.second", prelim: "round.prelim", qual: "round.qual", quarters: "round.quarters", semis: "round.semis",
  divSemis: "round.divSemis", divFinals: "round.divFinals", confQuarters: "round.confQuarters", confSemis: "round.confSemis",
  confFinal: "round.confFinal", confFinals: "round.confFinals", scSemis: "round.scSemis", tiebreak: "round.tiebreak", wcGame: "round.wcGame",
  wcSeries: "round.wcSeries", ds: "round.ds", lcs: "round.lcs", wildcard: "round.wildcard", divisional: "round.divisional",
  confChamp: "round.confChamp", cflSemi: "round.cflSemi", cflFinal: "round.cflFinal",
};

/** The calendar year a series was played in: its last game's (a Super Bowl or a spring final of a split-year season falls in the second year). */
export const playedYear = (s: Pick<Series, "end">): number => Number(s.end.slice(0, 4));

/** A round's name with the year it was played: "2023 Stanley Cup Final", "Super Bowl LIII (2019)", "2023 NHL Semifinals". */
export function datedRound(lg: string, year: number, played: number, name: string, isFinal: boolean, say: Say): string {
  if (isFinal && lg === "nfl" && year >= 1966) return say("final.nflDated", { numeral: roman(year - 1965), year: played });
  return isFinal ? say("round.dated", { year: played, name }) : say("round.datedLeague", { year: played, league: LG[lg as LeagueCode] ?? lg.toUpperCase(), name });
}

/** The name of a round; round 0 is the round robin, named by the caller. */
export const roundTitle = (names: readonly string[], round: number, robin: string): string => (round === 0 ? robin : names[round - 1] ?? "");

/** A round's address: /nhl/2023-24/playoffs/round/2 */
export const roundPath = (lg: string, year: number, round: number): string => `${seasonPath(lg, year)}/playoffs/round/${round}`;

/** The headline score of a series: "4–3", the single game's score, or the total score of a total-goals series. */
export function scoreText(s: Series): string {
  const [a, b] = s.sides;
  if (s.basis === "goals") return `${a.scored}–${b.scored}`;
  if (s.games.length === 1 && s.games[0].score[0] != null) return `${s.games[0].score[0]}–${s.games[0].score[1]}`;
  return `${a.wins}–${b.wins}`;
}

/** A short label for a series: "4 games to 3", or the single game's score. */
export function scoreWords(s: Series, say: Say): string {
  const [a, b] = s.sides;
  if (s.basis === "goals") return say("score.onTotal", { a: a.scored, b: b.scored });
  if (s.games.length === 1 && s.games[0].score[0] != null) return `${s.games[0].score[0]}–${s.games[0].score[1]}`;
  return say("score.gamesTo", { a: a.wins, b: b.wins });
}

/** "Won the final 4 games to 3 against Chicago Blackhawks" / "Won the final 25-17 against Edmonton Eskimos". */
const NOTE = /^(Won the (?:final|title game|championship) )(\d+ games? to \d+|\d+\s*[-–]\s*\d+)( against )(.+)$/i;
export interface ParsedNote { lead: string; score: string; mid: string; opp: string }
export function parseChampionNote(note: string | null | undefined): ParsedNote | null {
  const m = NOTE.exec((note ?? "").trim());
  return m ? { lead: m[1], score: m[2], mid: m[3], opp: m[4].trim() } : null;
}

const TWO_WORD = new Set(["maple leafs", "red wings", "blue jackets", "golden knights", "blue jays", "red sox", "white sox", "trail blazers", "black hawks", "blue bombers", "rough riders", "tiger cats", "silver knights"]);
/** A team's nickname for tight places: "Rangers" from "New York Rangers", "Maple Leafs" from "Toronto Maple Leafs". */
export function nickname(name: string): string {
  const w = name.trim().split(/\s+/);
  if (w.length < 2) return name;
  const two = w.slice(-2).join(" ");
  return TWO_WORD.has(two.toLowerCase().replace(/-/g, " ")) ? two : w[w.length - 1];
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The franchise a champion beat in its final, found among a season's playoff games by the opponent's name, and which
 * meeting of the two it was (the last: a pair can meet twice in a year).
 */
export function findFinal(games: readonly Pick<GameRow, "game_date" | "away_f" | "home_f" | "away" | "home">[], champ: number, oppName: string): { opp: number; meeting: number } | null {
  const want = norm(oppName);
  let opp: number | null = null;
  for (const g of games) {
    if (g.home_f === champ && g.away_f != null && norm(g.away) === want) { opp = g.away_f; break; }
    if (g.away_f === champ && g.home_f != null && norm(g.home) === want) { opp = g.home_f; break; }
  }
  if (opp == null) return null;
  const days = games
    .filter((g) => (g.home_f === champ && g.away_f === opp) || (g.away_f === champ && g.home_f === opp))
    .map((g) => dayNumber(g.game_date)).sort((x, y) => x - y);
  let meeting = 1;
  for (let i = 1; i < days.length; i++) if (days[i] - days[i - 1] > SERIES_GAP_DAYS) meeting++;
  return { opp, meeting };
}

/** The season page showing one day's games (the date page): ?phase= keeps the playoffs or the regular season, ?day= picks the day. */
export const datePath = (lg: string, year: number, date: string, phase: "playoffs" | "regular"): string =>
  `${seasonPath(lg, year)}?${phase === "playoffs" ? "phase=p&" : ""}month=${date.slice(0, 7)}&day=${date}`;

/** Where a team's winning share stood among a group of standings rows, or null when there is no share to rank. */
export function rankIn(rows: readonly { franchise_id: number; pct: number | null }[], f: number): { place: number; of: number } | null {
  const me = rows.find((r) => r.franchise_id === f);
  if (!me || me.pct == null) return null;
  const pool = rows.filter((r) => r.pct != null);
  const place = 1 + pool.filter((r) => r.pct! > me.pct!).length;
  return { place, of: pool.length };
}

/**
 * How a series was played, in the bracket package's words (`TiePlay`): one game is a game with its score, a series decided on total goals an aggregate of
 * its games, any other a best-of-N series with the games played (the wins of each side are worked out from them).
 */
export function seriesPlay(s: Series): TiePlay {
  const played = s.games.filter((g): g is SeriesGame & { score: [number, number] } => g.played && g.score[0] != null && g.score[1] != null);
  if (s.games.length === 1 && played.length === 1) return { kind: "game", score: played[0].score, ...(played[0].ot ? { extraTime: true } : {}) };
  const games = played.map((g) => ({ score: g.score, ...(g.ot ? { extraTime: true } : {}) }));
  return s.basis === "goals" ? { kind: "aggregate", legs: games } : { kind: "series", bestOf: s.bestOf, games, score: [s.sides[0].wins, s.sides[1].wins] };
}

/** The series as the bracket layout takes them (lib/bracketLayout.ts): the franchises of each, the winner's franchise, the start date, how it was played. */
export const seriesTies = (list: readonly Series[]): Tie[] =>
  list.map((s) => ({ teams: [s.sides[0].f, s.sides[1].f] as const, winner: s.winner == null ? null : s.sides[s.winner].f, start: s.start, play: seriesPlay(s) }));
