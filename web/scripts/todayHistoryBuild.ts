/**
 * Makes src/lib/todayHistory/data/<league>.json: for each of the five big leagues, the best few facts of each of the 366 calendar days.
 *
 *   node scripts/todayHistoryBuild.ts [--store <dir of the meigen-sports facts store>] [--rest http://127.0.0.1:7750/] [--audit <report.json>]
 *
 * Facts come from the meigen-sports data (the package's Pages feed, `facts/store/NN.json`; Wikidata CC0, Wikipedia CC BY-SA 4.0, Retrosheet, nflverse CC BY 4.0), and from
 * the database's own Stanley Cup finals for the NHL, whose games the data lacks. Every fact is checked against the read-only preview PostgREST (the DS1 copy, never production),
 * and what it says is made to agree with the database, or the fact (or the clause) is left out:
 *  - a game, final or feat: a game on that day with that score between exactly those two clubs, under the names the database gave them;
 *  - a retired number: the database's own retirement, worded with the club's name ON THAT DAY (`ClubNames`: the data wrote the franchise's first name, "the Quebec Nordiques
 *    retired Adam Foote's No. 52" in 2013, when it was the Colorado Avalanche);
 *  - an All-Star Game: the day; a building is named as it was called in that year (`VenueNames`), and a fact or clause whose building has no name for that year is left out;
 *  - a birthday or a death: the person's own day, age and death year; a club in the sentence must be a name its franchise carried while he played for it (his stints).
 * A person is linked only when the database knows the same id with the same name. `--audit` writes what was checked, changed and dropped. Reads only; run it by hand when
 * the data package or the database has moved, then commit the JSON.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rankFeed, significance, type OnThisDayRecord } from "@johnmorrisdotca/meigen-sports";
import { ClubNames, unknownClubs, VenueNames, type NameRow, type SeasonName, type VenueNameRow } from "../src/lib/todayHistory/names.ts";
import { HISTORY_LEAGUES, HISTORY_SPORTS, type HistoryFact, type HistoryFile } from "../src/lib/todayHistory/types.ts";
import { compactAllStar, cupFinalText, isKind, KINDS, MAX_ROWS, plainName, rowsOf, withoutDate, type CupFinalRow, type HistoryKind } from "../src/lib/todayHistory/words.ts";

const args = process.argv.slice(2);
const arg = (name: string): string | undefined => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const REST = (arg("rest") ?? process.env.SPX_REST_URL ?? "http://127.0.0.1:7750/").replace(/\/?$/, "/");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(REST)) throw new Error(`refusing ${REST}: only the local preview PostgREST (never production)`);
const PAGES = "https://johnmorrisdotca.github.io/meigen-sports/data/v1";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../src/lib/todayHistory/data");
const TODAY = new Date().toISOString().slice(0, 10);

interface Club { name: string; franchiseId?: number }
type Rec = OnThisDayRecord & {
  eventDate: string; league?: string; text?: string; source: { sourceId: string };
  person?: { personId?: number; name?: string; teamSeasonIds?: number[] };
  clubNames?: string[]; clubName?: string; opponentName?: string; jerseyNumber?: number;
  home?: Club; away?: Club; venueName?: string; venueCity?: string; position?: string;
};

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
const years = (from: string, to: string): number => { const [a, b] = [from, to].map((d) => d.split("-").map(Number)); return b[0] - a[0] - (b[1] < a[1] || (b[1] === a[1] && b[2] < a[2]) ? 1 : 0); };

interface Person { person_id: number; name: string; birth_date: string | null; death_date: string | null; leagues: string[] | null }
interface Stint { person_id: number; league: string; franchise_id: number; from_year: number; to_year: number }
interface Game { league: string; year: number; game_date: string; phase: string; home: string; away: string; home_score: number | null; away_score: number | null }
interface Retired { league: string; franchise_id: number | null; jersey_number: number; person_id: number | null; name: string | null; retired_on: string | null }
type Verdict = { t: string; changed?: string; cosmetic?: boolean } | { why: string };

async function main() {
  const latest = (await (await fetch(`${PAGES}/latest.json`)).json()) as { package: string; build: string };
  const store = await loadStore();
  console.log(`store ${store.length} facts, package ${latest.package}, build ${latest.build.slice(0, 12)}`);

  const [retired, allStar, cups, cupGames, nameRows, seasonNames, venueRows] = await Promise.all([
    rest<Retired>("retired_number"),
    rest<{ league: string; first_day: string | null }>("all_star_event"),
    rest<{ year: number; team1_name: string; team2_name: string; team1_games: number; team2_games: number; winner_side: number | null }>("cup_final?order=year"),
    rest<{ year: number; game_no: number; played_on: string | null; team1_score: number; team2_score: number; venue_name: string | null; venue_city: string | null }>("cup_final_game?order=year,game_no"),
    rest<NameRow>("franchise_names"),
    rest<SeasonName>("team_season_index?select=league,year,franchise_id,team"),
    rest<VenueNameRow>("venue_name"),
  ]);
  const clubs = new ClubNames(nameRows, seasonNames.map((s) => ({ league: s.league, franchise_id: s.franchise_id, year: s.year, team: s.team })));
  const venues = new VenueNames(venueRows);
  const allStarDays = new Set(allStar.flatMap((e) => (e.first_day ? [`${e.league}|${e.first_day}`] : [])));
  const retiredBy = new Map<string, Retired[]>();
  for (const r of retired) if (r.retired_on) { const k = `${r.league}|${r.retired_on}|${r.jersey_number}`; (retiredBy.get(k) ?? retiredBy.set(k, []).get(k)!).push(r); }

  // The people of the data, and of the retirements, the database knows by id; and the clubs each played for.
  const ids = [...new Set([...store.flatMap((r) => (r.person?.personId ? [r.person.personId] : [])), ...retired.flatMap((r) => (r.person_id ? [r.person_id] : []))])];
  const people = new Map<number, Person>();
  const stints = new Map<number, Stint[]>();
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150).join(",");
    for (const p of await rest<Person>(`people?person_id=in.(${chunk})&select=person_id,name,birth_date,death_date,leagues`)) people.set(p.person_id, p);
    for (const s of await rest<Stint>(`person_teams?person_id=in.(${chunk})`)) (stints.get(s.person_id) ?? stints.set(s.person_id, []).get(s.person_id)!).push(s);
  }
  console.log(`${ids.length} people in the data, ${people.size} known to the database`);
  // The name each team season of those people was played under (`api.team_season_identity`): the club in a sentence must be one of theirs.
  const seasonIds = [...new Set(store.flatMap((r) => r.person?.teamSeasonIds ?? []))];
  const seasonTeam = new Map<number, string>();
  const chunks: number[][] = [];
  for (let i = 0; i < seasonIds.length; i += 250) chunks.push(seasonIds.slice(i, i + 250));
  await pool(chunks, 6, async (c) => { for (const row of await rest<{ team_season_id: number; team: string }>(`team_season_identity?team_season_id=in.(${c.join(",")})&select=team_season_id,team`)) seasonTeam.set(row.team_season_id, row.team); });
  console.log(`${seasonIds.length} team seasons, ${seasonTeam.size} named`);

  const gameCache = new Map<string, Promise<Game[]>>();
  const gamesOn = (lg: string, date: string): Promise<Game[]> => {
    const y = Number(date.slice(0, 4));
    const key = `${lg}|${date}`;
    if (!gameCache.has(key)) gameCache.set(key, rest<Game>(`games?league=eq.${lg}&year=in.(${y - 1},${y})&game_date=eq.${date}&select=league,year,game_date,phase,home,away,home_score,away_score`));
    return gameCache.get(key)!;
  };

  /** A sentence's building clause ` at <venue>, <city>` made to say the building's name in that year: unchanged, renamed, removed (`null` text part) or, for a fact that cannot do without it, a refusal. */
  function venueClause(text: string, venue: string | undefined, city: string | undefined, year: number, lead: string): { t: string; note?: string } | { why: string } {
    if (!venue || !city) return { t: text };
    const clause = `${lead}${venue}, ${city}`;
    if (!text.includes(clause)) return { why: "sentence does not hold the building clause" };
    const v = venues.in(venue, year);
    if (v && "keep" in v) return { t: text };
    if (v) return { t: text.replace(clause, `${lead}${v.name}, ${city}`), note: `building ${venue} -> ${v.name}` };
    return { why: `no name of ${venue} for ${year}` };
  }

  /** The verdict on one fact of the data: its sentence as it may be shown (maybe changed), or why not. */
  async function verify(lg: string, r: Rec): Promise<Verdict> {
    const kind = r.category as HistoryKind;
    const base = withoutDate(kind, r.text ?? "");
    if (!base) return { why: "no date in the usual shape" };
    const year = Number(r.eventDate.slice(0, 4));

    if (kind === "retired-number") {
      const rows = retiredBy.get(`${lg}|${r.eventDate}|${r.jerseyNumber}`) ?? [];
      const mine = rows.find((x) => plainName(x.name ?? "") === plainName(r.person?.name ?? "")) ?? (rows.length === 1 ? rows[0] : undefined);
      if (!mine) return { why: "no such retirement on that day" };
      const p = mine.person_id ? people.get(mine.person_id) : undefined;
      if (p?.birth_date && r.eventDate < p.birth_date) return { why: "retired before the player was born" };
      if (mine.franchise_id == null) return { t: base };                       // the league retired it: "the NHL retired No. 99 across the league for Wayne Gretzky"
      const club = clubs.at(lg, mine.franchise_id, r.eventDate);
      if (!club) return { why: `franchise ${mine.franchise_id} has no name on ${r.eventDate}` };
      const t = `The ${club} retired ${mine.name ?? r.person?.name}'s No. ${mine.jersey_number}.`;
      return { t, changed: t === base ? undefined : "club named as on that day", cosmetic: plainName(t) === plainName(base) };
    }

    if (kind === "all-star") {
      if (!allStarDays.has(`${lg}|${r.eventDate}`)) return { why: "no such All-Star Game on that day" };
      const v = venueClause(base, r.venueName, r.venueCity, year, " at ");
      if ("why" in v) return v;
      return { t: compactAllStar(v.t, r.venueCity), changed: v.note };
    }

    if (kind === "player-birthday" || kind === "player-death") {
      const p = r.person?.personId ? people.get(r.person.personId) : undefined;
      if (!p) return { why: "person unknown to the database" };
      const day = kind === "player-birthday" ? p.birth_date : p.death_date;
      if (day !== r.eventDate) return { why: `database has ${day}` };
      if (r.eventDate > TODAY) return { why: "in the future" };
      if (p.birth_date && p.death_date && p.death_date < p.birth_date) return { why: "died before born" };
      const died = /\(died (\d{4})\)/.exec(base)?.[1];
      if (died && (!p.death_date || p.death_date.slice(0, 4) !== died)) return { why: `text says died ${died}, database ${p.death_date}` };
      const aged = /aged (\d+)/.exec(base)?.[1];
      if (aged && (!p.birth_date || !p.death_date || years(p.birth_date, p.death_date) !== Number(aged))) return { why: `text says aged ${aged}, database ${p.birth_date} to ${p.death_date}` };
      // A club in the sentence must be a name one of his clubs carried in a season he played: the identity of each team season he is on, or the names of the franchise during a stint.
      const his = new Set((r.person?.teamSeasonIds ?? []).flatMap((id) => (seasonTeam.get(id) ? [plainName(seasonTeam.get(id)!)] : [])));
      for (const s of (stints.get(p.person_id) ?? []).filter((x) => x.league === lg)) for (const n of clubs.duringSeasons(lg, s.franchise_id, s.from_year, s.to_year)) his.add(n);
      const wrong = unknownClubs(base, r.clubNames ?? [], his);
      if (wrong.length) return { why: `${wrong[0]} is not the name of any club he played for in a season he played` };
      return { t: base };
    }

    // Games: both clubs, the score and the day, under the names the database's game carries.
    const score = pair(base);
    if (!score) return { why: "no score" };
    const sides = kind === "game-feat" ? [r.clubName, r.opponentName] : [r.home?.name, r.away?.name];
    if (sides.some((s) => !s) || !sides.every((s) => plainName(base).includes(plainName(s!)))) return { why: "clubs missing from the sentence" };
    const games = (await gamesOn(lg, r.eventDate)).filter((g) => sameScore(score, g.home_score, g.away_score) && (kind !== "championship-final" || g.phase === "playoffs"));
    const want = sides.map((s) => plainName(s!)).sort().join("|");
    if (!games.some((g) => [g.home, g.away].map(plainName).sort().join("|") === want)) return { why: "no game that day between exactly these clubs with that score" };
    if (kind !== "championship-final") return { t: base };
    // The building is checked (the data names today's), and then left out of the sentence: a small block has no room for it, and the result stands without it.
    const v = venueClause(base, r.venueName, r.venueCity, year, " at ");
    const t = base.replace(` at ${r.venueName}, ${r.venueCity}`, "");
    return { t, changed: "why" in v ? `building clause removed: ${v.why}` : v.note };
  }

  // The Stanley Cup finals: the game that decided each one.
  const cup: { md: string; f: HistoryFact; note?: string }[] = [];
  for (const c of cups) {
    const games = cupGames.filter((g) => g.year === c.year);
    const last = games.at(-1);
    if (!last?.played_on || (c.winner_side !== 1 && c.winner_side !== 2)) continue;
    const won = last.team1_score === last.team2_score ? 0 : last.team1_score > last.team2_score ? 1 : 2;
    const wins = c.winner_side === 1 ? c.team1_games : c.team2_games;
    if (won !== c.winner_side || wins !== games.filter((g) => (c.winner_side === 1 ? g.team1_score > g.team2_score : g.team2_score > g.team1_score)).length) { console.log(`cup ${c.year}: the last game does not decide the series, left out`); continue; }
    const row: CupFinalRow = { year: c.year, winnerSide: c.winner_side, team1: c.team1_name, team2: c.team2_name, team1Games: c.team1_games, team2Games: c.team2_games,
      game: { no: last.game_no, playedOn: last.played_on, team1Score: last.team1_score, team2Score: last.team2_score, venue: last.venue_name, city: last.venue_city } };
    let note: string | undefined;
    if (last.venue_name && last.venue_city) {
      const v = venueClause(cupFinalText(row), last.venue_name, last.venue_city, Number(last.played_on.slice(0, 4)), " at ");
      note = "why" in v ? `building clause removed: ${v.why}` : v.note;
    }
    const t = cupFinalText({ ...row, game: { ...row.game, venue: null } });
    cup.push({ md: last.played_on.slice(5), f: { l: "nhl", y: Number(last.played_on.slice(0, 4)), t, s: "wikipedia", k: "championship-final" }, note });
  }
  console.log(`${cup.length} Stanley Cup finals (${cup.filter((c) => c.note).length} with a building changed)`);

  // The whole data of the five leagues, checked.
  const audit: Record<string, { checked: number; changed: number; cosmetic: number; dropped: number; why: Record<string, number> }> = {};
  const examples: { before: string; after: string; lg: string; date: string; kind: string; note: string }[] = [];
  const dropped: { lg: string; date: string; kind: string; why: string; text: string }[] = [];
  const verdicts = new Map<string, Verdict>();
  const mineAll = store.filter((r) => r.league && (HISTORY_LEAGUES as readonly string[]).includes(r.league) && isKind(r.category) && r.text);
  await pool(mineAll, 8, async (r) => {
    const v = await verify(r.league!, r);
    verdicts.set(r.recordId, v);
    const a = (audit[`${r.league}/${r.category}`] ??= { checked: 0, changed: 0, cosmetic: 0, dropped: 0, why: {} });
    a.checked++;
    if ("why" in v) { a.dropped++; const k = v.why.replace(/\d+/g, "N").slice(0, 70); a.why[k] = (a.why[k] ?? 0) + 1; dropped.push({ lg: r.league!, date: r.eventDate, kind: r.category, why: v.why, text: r.text! }); }
    else if (v.changed && v.cosmetic) a.cosmetic++;
    else if (v.changed) { a.changed++; examples.push({ before: withoutDate(r.category as HistoryKind, r.text!)!, after: v.t, lg: r.league!, date: r.eventDate, kind: r.category, note: v.changed }); }
  });

  const norm = (t: string) => t.replace(/ \([^)]*\)/g, "");
  const byKey = new Map(mineAll.map((r) => [`${r.league}|${r.eventDate.slice(5)}|${Number(r.eventDate.slice(0, 4))}|${norm(withoutDate(r.category as HistoryKind, r.text!) ?? "")}`, r.recordId]));
  // The earlier league files (`--old <dir of <league>.json>`): each old line against the verdict on the same fact.
  const shipped: Record<string, { facts: number; changed: number; dropped: number }> = {};
  const oldDir = arg("old");
  if (oldDir) for (const lg of HISTORY_LEAGUES) {
    const sh = (shipped[lg] = { facts: 0, changed: 0, dropped: 0 });
    const old = JSON.parse(readFileSync(join(oldDir, `${lg}.json`), "utf8")) as { days: Record<string, { y: number; t: string }[]> };
    for (const [md, fs] of Object.entries(old.days)) for (const f of fs) {
      sh.facts++;
      const id = byKey.get(`${lg}|${md}|${f.y}|${norm(f.t)}`);
      const v = id ? verdicts.get(id) : undefined;
      if (v && "why" in v) sh.dropped++; else if (v?.changed && !v.cosmetic) sh.changed++;
    }
  }

  mkdirSync(OUT, { recursive: true });
  const kindOrder = new Map(KINDS.map((k, i) => [k, i]));
  /** Up to three lines for a day from the sports' leagues, fairly: each league's own best lines (ranked as for one league), taken in turn, starting with the league whose best line ranks highest
   * (a tie goes to the league the day of the year picks), so a league with the better lines leads but never fills the block while another has lines. A day only one league has lines for is that league's. */
  const pickFair = (lists: Rec[][], dayOfYear: number): Rec[] => {
    const live = lists.filter((l) => l.length).sort((a, b) => significance(b[0]) - significance(a[0]) || ((dayOfYear + lists.indexOf(a)) % 2) - ((dayOfYear + lists.indexOf(b)) % 2));
    const out: Rec[] = [];
    for (let i = 0; out.length < 3 && live.some((l) => i < l.length); i++) for (const l of live) if (i < l.length && out.length < 3) out.push(l[i]);
    return out;
  };
  const dayNo = (md: string) => Math.floor((Date.UTC(2024, Number(md.slice(0, 2)) - 1, Number(md.slice(3))) - Date.UTC(2024, 0, 0)) / 86400000);
  for (const { sport, leagues } of HISTORY_SPORTS) {
    const days: Record<string, HistoryFact[]> = {};
    const perLeague = leagues.map((lg) => {
      const byDay = new Map<string, Rec[]>();
      for (const r of mineAll.filter((x) => x.league === lg && !("why" in verdicts.get(x.recordId)!))) { const md = r.eventDate.slice(5); (byDay.get(md) ?? byDay.set(md, []).get(md)!).push(r); }
      return { lg, byDay };
    });
    const mds = [...new Set(perLeague.flatMap((p) => [...p.byDay.keys()]))].sort();
    let kept = 0, linked = 0;
    const both: Record<string, number> = {};
    for (const md of mds) {
      const lists = perLeague.map(({ byDay }) => (rankFeed(byDay.get(md) ?? [], 3, { maxPer: 2 }) as Rec[]));
      const leaguesWith = lists.filter((l) => l.length).length;
      both[leaguesWith] = (both[leaguesWith] ?? 0) + 1;
      const facts: HistoryFact[] = pickFair(lists, dayNo(md)).map((r) => {
        const kind = r.category as HistoryKind, lg = r.league!;
        let t = (verdicts.get(r.recordId) as { t: string }).t;
        // A name the data keeps with its Wikidata qualifier ("Justin Lawrence (Canadian football)") is written without it.
        const named = r.person?.name ?? "";
        const bare = named.replace(/ \([^)]*\)$/, "");
        if (bare !== named && t.startsWith(named)) t = bare + t.slice(named.length);
        const f: HistoryFact = { l: lg, y: Number(r.eventDate.slice(0, 4)), t, s: SOURCE_CODE[r.source.sourceId] ?? r.source.sourceId, k: kind };
        const pid = r.person?.personId, p = pid ? people.get(pid) : undefined;
        if ((kind === "player-birthday" || kind === "player-death") && p && p.leagues?.includes(lg) && plainName(p.name.replace(/ \([^)]*\)$/, "")) === plainName(bare) && t.startsWith(bare)) { f.p = p.person_id; f.n = bare.length; linked++; }
        return f;
      });
      if (leagues.includes("nhl" as never)) for (const c of cup.filter((x) => x.md === md)) facts.unshift(c.f);
      // What is shown first is chosen above; what is drawn is newest year first, a year's lines in the order chosen (league order, kind order, then the sentence settle a tie the same way every build).
      const order = (f: HistoryFact) => [leagues.indexOf(f.l as never), kindOrder.get(f.k) ?? 99];
      // Lines chosen in rank order while they fit the block's rows (the first always); what is drawn is sorted below.
      let used = 0;
      const fit = facts.slice(0, 3).filter((f, i) => { if (i > 0 && used + rowsOf(f.t) > MAX_ROWS) return false; used += rowsOf(f.t); return true; });
      const chosen = fit.sort((a, b) => b.y - a.y || order(a)[0] - order(b)[0] || order(a)[1] - order(b)[1] || a.t.localeCompare(b.t));
      if (chosen.length) { days[md] = chosen; kept += chosen.length; }
    }
    if (leagues.includes("nhl" as never)) for (const c of cup) if (!days[c.md]) days[c.md] = [c.f];
    const file: HistoryFile = { sport, leagues: [...leagues], package: latest.package, build: latest.build, days };
    writeFileSync(join(OUT, `${sport}.json`), JSON.stringify(file) + "\n");
    console.log(`${sport} (${leagues.join(", ")}): ${Object.keys(days).length} days, ${kept} facts, ${linked} linked; days by how many leagues had lines: ${JSON.stringify(both)}`);
  }
  console.log("\nchecked / changed (substantive) / cosmetic / dropped by league and kind");
  for (const [k, a] of Object.entries(audit).sort()) console.log(`  ${k.padEnd(28)} ${String(a.checked).padStart(6)} ${String(a.changed).padStart(5)} ${String(a.cosmetic).padStart(5)} ${String(a.dropped).padStart(5)}  ${Object.entries(a.why).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([w, n]) => `${n}x ${w}`).join("; ")}`);
  console.log("earlier files, lines the new checks change or drop:", JSON.stringify(shipped));
  const report = arg("audit");
  if (report) writeFileSync(report, JSON.stringify({ audit, shipped, examples, dropped }, null, 1));
}
await main();
