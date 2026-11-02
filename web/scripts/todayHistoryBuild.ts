/**
 * Makes src/lib/todayHistory/data/<league>.json: for each of the five big leagues, the best few facts of each of the 366 calendar days.
 *
 *   node scripts/todayHistoryBuild.ts [--store <dir of the meigen-sports facts store>] [--rest http://127.0.0.1:7750/]
 *
 * Facts come from the meigen-sports data (the package's Pages feed, `facts/store/NN.json`; Wikidata CC0, Wikipedia CC BY-SA 4.0, Retrosheet, nflverse CC BY 4.0), and from
 * the database's own Stanley Cup finals for the NHL, whose games the data lacks. Every game, final, All-Star Game, retired number and person is checked against the
 * read-only preview PostgREST (the DS1 copy, never production): a fact the database does not bear out (no such game on that day with that score, a person born on
 * another day) is dropped, not kept. A person is linked only when the database knows the same id with the same name. Reads only; run it by hand when the data
 * package or the database has moved, then commit the JSON.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rankFeed, type OnThisDayRecord } from "@johnmorrisdotca/meigen-sports";
import { HISTORY_LEAGUES, type HistoryFact, type HistoryFile } from "../src/lib/todayHistory/types.ts";
import { cupFinalText, isKind, plainName, withoutDate, type CupFinalRow, type HistoryKind } from "../src/lib/todayHistory/words.ts";

const args = process.argv.slice(2);
const arg = (name: string): string | undefined => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const REST = (arg("rest") ?? process.env.SPX_REST_URL ?? "http://127.0.0.1:7750/").replace(/\/?$/, "/");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(REST)) throw new Error(`refusing ${REST}: only the local preview PostgREST (never production)`);
const PAGES = "https://johnmorrisdotca.github.io/meigen-sports/data/v1";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../src/lib/todayHistory/data");

type Rec = OnThisDayRecord & { eventDate: string; league?: string; person?: { personId?: number; name?: string }; text?: string; source: { sourceId: string } };

async function rest<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(REST + path, { headers: { "Accept-Profile": "api", "Range-Unit": "items", Range: `${from}-${from + 999}` } });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    const page = (await res.json()) as T[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } }));
  return out;
}

async function loadStore(): Promise<Rec[]> {
  const dir = arg("store");
  const all: Rec[] = [];
  if (dir) {
    for (const f of readdirSync(dir).sort()) { const d = JSON.parse(readFileSync(join(dir, f), "utf8")); all.push(...(d.records ?? d)); }
    return all;
  }
  for (let i = 0; i < 100; i++) {
    const res = await fetch(`${PAGES}/0.1.0/facts/store/${String(i).padStart(2, "0")}.json`);
    if (!res.ok) throw new Error(`store ${i}: ${res.status}`);
    const d = await res.json();
    all.push(...(d.records ?? d));
  }
  return all;
}

/** The data's own source codes that are the site's code under another name (the daily job's pages are Wikipedia's, CC BY-SA 4.0). */
const SOURCE_CODE: Record<string, string> = { wikipedia_daily: "wikipedia", wikipedia_mls: "wikipedia" };
const pair = (t: string): [number, number] | null => { const m = [...t.matchAll(/(\d+)–(\d+)/g)].at(-1); return m ? [Number(m[1]), Number(m[2])] : null; };
const sameScore = (a: [number, number], h: number | null, v: number | null) => h != null && v != null && ((a[0] === h && a[1] === v) || (a[0] === v && a[1] === h));

interface Person { person_id: number; name: string; birth_date: string | null; death_date: string | null; leagues: string[] | null }
interface Game { league: string; year: number; game_date: string; phase: string; home: string; away: string; home_score: number | null; away_score: number | null }

async function main() {
  const latest = (await (await fetch(`${PAGES}/latest.json`)).json()) as { package: string; build: string };
  const store = await loadStore();
  console.log(`store ${store.length} facts, package ${latest.package}, build ${latest.build.slice(0, 12)}`);

  // Facts the database can be asked about.
  const [retired, allStar, cups, cupGames] = await Promise.all([
    rest<{ league: string; jersey_number: number; name: string | null; retired_on: string | null }>("retired_number"),
    rest<{ league: string; first_day: string | null; last_day: string | null }>("all_star_event"),
    rest<{ year: number; team1_name: string; team2_name: string; team1_games: number; team2_games: number; winner_side: number | null }>("cup_final?order=year"),
    rest<{ year: number; game_no: number; played_on: string | null; team1_score: number; team2_score: number; venue_name: string | null; venue_city: string | null }>("cup_final_game?order=year,game_no"),
  ]);
  const retiredOn = new Set(retired.filter((r) => r.retired_on).map((r) => `${r.league}|${r.retired_on}|${r.jersey_number}`));
  const allStarDays = new Set(allStar.flatMap((e) => (e.first_day ? [`${e.league}|${e.first_day}`] : [])));

  // The people of the data the database knows by id.
  const ids = [...new Set(store.flatMap((r) => (r.person?.personId ? [r.person.personId] : [])))];
  const people = new Map<number, Person>();
  for (let i = 0; i < ids.length; i += 150) {
    for (const p of await rest<Person>(`people?person_id=in.(${ids.slice(i, i + 150).join(",")})&select=person_id,name,birth_date,death_date,leagues`)) people.set(p.person_id, p);
  }
  console.log(`${ids.length} people in the data, ${people.size} known to the database`);

  const gameCache = new Map<string, Promise<Game[]>>();
  const gamesOn = (lg: string, date: string): Promise<Game[]> => {
    const y = Number(date.slice(0, 4));
    const key = `${lg}|${date}`;
    if (!gameCache.has(key)) gameCache.set(key, rest<Game>(`games?league=eq.${lg}&year=in.(${y - 1},${y})&game_date=eq.${date}&select=league,year,game_date,phase,home,away,home_score,away_score`));
    return gameCache.get(key)!;
  };

  /** null when the database bears the fact out (or has nothing to say about it), otherwise why not. */
  async function check(lg: string, r: Rec): Promise<string | null> {
    const kind = r.category as HistoryKind;
    const text = r.text ?? "";
    if (kind === "retired-number") {
      const no = /No\. (\d+)/.exec(text)?.[1];
      return no && retiredOn.has(`${lg}|${r.eventDate}|${no}`) ? null : "no such retirement on that day";
    }
    if (kind === "all-star") return allStarDays.has(`${lg}|${r.eventDate}`) ? null : "no such All-Star Game on that day";
    if (kind === "player-birthday" || kind === "player-death") {
      const p = r.person?.personId ? people.get(r.person.personId) : undefined;
      if (!p) return null;
      const day = kind === "player-birthday" ? p.birth_date : p.death_date;
      return day === r.eventDate ? null : `database has ${day}`;
    }
    const score = pair(withoutDate(kind, text) ?? text);
    if (!score) return "no score";
    const games = (await gamesOn(lg, r.eventDate)).filter((g) => sameScore(score, g.home_score, g.away_score) && (kind !== "championship-final" || g.phase === "playoffs"));
    const t = plainName(text);
    return games.some((g) => t.includes(plainName(g.home)) || t.includes(plainName(g.away))) ? null : "no such game on that day";
  }

  // The Stanley Cup finals: the game that decided each one.
  const cup: { md: string; f: HistoryFact }[] = [];
  for (const c of cups) {
    const games = cupGames.filter((g) => g.year === c.year);
    const last = games.at(-1);
    if (!last?.played_on || (c.winner_side !== 1 && c.winner_side !== 2)) continue;
    const won = last.team1_score === last.team2_score ? 0 : last.team1_score > last.team2_score ? 1 : 2;
    const wins = c.winner_side === 1 ? c.team1_games : c.team2_games;
    if (won !== c.winner_side || wins !== games.filter((g) => (c.winner_side === 1 ? g.team1_score > g.team2_score : g.team2_score > g.team1_score)).length) { console.log(`cup ${c.year}: the last game does not decide the series, left out`); continue; }
    const row: CupFinalRow = { year: c.year, winnerSide: c.winner_side, team1: c.team1_name, team2: c.team2_name, team1Games: c.team1_games, team2Games: c.team2_games,
      game: { no: last.game_no, playedOn: last.played_on, team1Score: last.team1_score, team2Score: last.team2_score, venue: last.venue_name, city: last.venue_city } };
    cup.push({ md: last.played_on.slice(5), f: { y: Number(last.played_on.slice(0, 4)), t: cupFinalText(row), s: "wikipedia", k: "championship-final" } });
  }
  console.log(`${cup.length} Stanley Cup finals`);

  mkdirSync(OUT, { recursive: true });
  for (const lg of HISTORY_LEAGUES) {
    const mine = store.filter((r) => r.league === lg && isKind(r.category) && r.text && withoutDate(r.category, r.text));
    const banned = new Set<string>();
    const days: Record<string, HistoryFact[]> = {};
    const byDay = new Map<string, Rec[]>();
    for (const r of mine) { const md = r.eventDate.slice(5); (byDay.get(md) ?? byDay.set(md, []).get(md)!).push(r); }
    let dropped = 0, kept = 0, linked = 0;
    for (const [md, list] of [...byDay].sort(([a], [b]) => a.localeCompare(b))) {
      let picked: Rec[] = [];
      for (let pass = 0; pass < 6; pass++) {
        picked = rankFeed(list.filter((r) => !banned.has(r.recordId)), 3, { maxPer: 2 }) as Rec[];
        const bad = (await Promise.all(picked.map(async (r) => [r, await check(lg, r)] as const))).filter(([, why]) => why);
        if (!bad.length) break;
        for (const [r, why] of bad) { banned.add(r.recordId); dropped++; console.log(`  drop ${lg} ${r.eventDate} ${r.category}: ${why}: ${r.text}`); }
      }
      const facts: HistoryFact[] = picked.map((r) => {
        const kind = r.category as HistoryKind;
        let t = withoutDate(kind, r.text!)!;
        // A name the data keeps with its Wikidata qualifier ("Justin Lawrence (Canadian football)") is written without it.
        const named = r.person?.name ?? "";
        const bare = named.replace(/ \([^)]*\)$/, "");
        if (bare !== named && t.startsWith(named)) t = bare + t.slice(named.length);
        const f: HistoryFact = { y: Number(r.eventDate.slice(0, 4)), t, s: SOURCE_CODE[r.source.sourceId] ?? r.source.sourceId, k: kind };
        const pid = r.person?.personId, p = pid ? people.get(pid) : undefined;
        if ((kind === "player-birthday" || kind === "player-death") && p && p.leagues?.includes(lg) && plainName(p.name.replace(/ \([^)]*\)$/, "")) === plainName(bare) && t.startsWith(bare)) { f.p = p.person_id; f.n = bare.length; linked++; }
        return f;
      });
      if (lg === "nhl") for (const c of cup.filter((x) => x.md === md)) facts.unshift(c.f);
      if (facts.length) { days[md] = facts.slice(0, 3); kept += days[md].length; }
    }
    if (lg === "nhl") for (const c of cup) if (!days[c.md]) days[c.md] = [c.f];
    const file: HistoryFile = { league: lg, package: latest.package, build: latest.build, days };
    writeFileSync(join(OUT, `${lg}.json`), JSON.stringify(file) + "\n");
    console.log(`${lg}: ${Object.keys(days).length} days, ${kept} facts, ${linked} linked, ${dropped} dropped`);
  }
}
await main();
