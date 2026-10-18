import { buildSlugs, makePaths, parseSeasonSeg, resolveTeamSeason, seasonSlug, tableOf, type NameRow, type SeasonNameRow } from "../src/lib/slug.ts";

/**
 * Lists the team and team-season slugs per league from the live archive (run in web/: node scripts/check-slugs.ts [--all]).
 * Prints the slugs that had to be told apart, and exits 1 if any two franchises still share a slug, or if the team-season address built for any
 * season of any league (the women's leagues included: it is the link of every standings row) does not read back as that team in that season.
 */
const REST = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://njpvfrceahkvnrduerkk.supabase.co").replace(/\/+$/, "") + "/rest/v1/";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_FmeiL6oX9_Mrb8psQZFSQg_YO_O4afC";

async function all<T>(view: string, query: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${REST}${view}?${query}`, { headers: { apikey: KEY, "Accept-Profile": "api", Range: `${from}-${from + 999}` } });
    if (!res.ok) throw new Error(`${view}: ${res.status}`);
    const part = (await res.json()) as T[];
    out.push(...part);
    if (part.length < 1000) return out;
  }
}

const names = await all<NameRow>("franchise_names", "select=league,franchise_id,name,name_from,name_to&order=league,franchise_id,name_from");
const seasons = await all<SeasonNameRow>("team_seasons", "select=league,year,franchise_id,team&order=league,year,franchise_id");
const s = buildSlugs(names, seasons);
let bad = 0;

for (const [lg, L] of Object.entries(s.leagues)) {
  const seen = new Map<string, number>();
  for (const [f, e] of Object.entries(L.entries)) {
    if (!e.s) { console.log(`${lg} ${f}: empty slug`); bad++; }
    if (seen.has(e.s)) { console.log(`${lg}: franchise slug ${e.s} used by ${seen.get(e.s)} and ${f}`); bad++; }
    seen.set(e.s, Number(f));
  }
  const paths = makePaths(tableOf(s));
  for (const [f, set] of L.years) {
    for (const y of set) {
      const path = paths.teamSeason(lg, f, y);
      const [, , seg, , slug] = path.split("/");
      const ys = parseSeasonSeg(lg, seg);
      if (!ys || ys.y !== y || !ys.canonical || resolveTeamSeason(L, y, slug) !== f || resolveTeamSeason(L, y, String(f)) !== f) { console.log(`${lg}: ${path} does not resolve back to franchise ${f} in ${y}`); bad++; }
    }
  }
  const perYear = new Map<string, number>();
  for (const [f, set] of L.years) {
    for (const y of set) {
      const k = `${y}|${seasonSlug(L.entries[f], y)}`;
      if (perYear.has(k)) { console.log(`${lg}: season slug ${k} used by ${perYear.get(k)} and ${f}`); bad++; }
      perYear.set(k, f);
    }
  }
  const odd = [...L.index.keys()].filter((k) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(k));
  if (odd.length) { console.log(`${lg}: odd slugs ${odd.join(", ")}`); bad++; }
  console.log(`${lg}: ${Object.keys(L.entries).length} franchises, ${perYear.size} team-seasons`);
  if (process.argv.includes("--all")) for (const [f, e] of Object.entries(L.entries)) console.log(`  ${f} ${e.s}${e.c ? "  " + JSON.stringify(e.c) : ""}`);
}

console.log("\nslugs told apart:");
for (const c of s.clashes) console.log(`  ${c.league} ${c.kind}${c.year ? " " + c.year : ""} ${c.slug}: franchises ${c.franchises.join(", ")} -> ${c.chosen.join(", ")}`);
console.log(`\nbrowser table: ${JSON.stringify(tableOf(s)).length} bytes`);
if (bad) {
  console.log(`${bad} problem(s)`);
  process.exit(1);
}
console.log("ok: no duplicate slugs");
