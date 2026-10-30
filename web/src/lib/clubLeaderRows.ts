import { z } from "zod";
import type { PhraseKey } from "./i18n/phrases.constants.ts";

/**
 * The club leaders of a CFL club season (api.team_season_leader, migration 175): the Passing, Rushing and Receiving tables of the club-season article on English
 * Wikipedia, and the BC Lions' 1958-81 "Offensive leaders" table (`offence`), as the article lists them. A name is linked to a player only where the archive
 * is certain who he is (`person_id`); every other name is text. The figures arrive as the article writes them: text, null where it leaves the cell empty or says N/A.
 */
export const LEADER_CATEGORIES = ["passing", "rushing", "receiving", "offence"] as const;
export type LeaderCategory = (typeof LEADER_CATEGORIES)[number];

export const leaderRowSchema = z.object({
  team_season_id: z.number(), category: z.enum(LEADER_CATEGORIES), ord: z.number(), name: z.string(), person_id: z.number().nullable(),
  stats: z.record(z.string(), z.string().nullable()), source_key: z.string(),
});

export interface LeaderLine {
  name: string;
  /** The player's page, or null where the name is shown as text. */
  id: number | null;
  stats: Record<string, string | null>;
}

export interface LeaderTable {
  category: LeaderCategory;
  lines: LeaderLine[];
  /** The figures this table shows, in column order: only those some line has. */
  keys: string[];
}

export interface LeaderData {
  tables: LeaderTable[];
  /** The article the lines were read from, as `enwiki:<title>@<revision id>` gives it. */
  article: { title: string; revid: number } | null;
}

/** The figures each table can show, in column order, with the phrases that label and explain them. */
export const LEADER_COLUMNS: Record<LeaderCategory, { key: string; label: PhraseKey; title: PhraseKey }[]> = {
  passing: [
    { key: "gp", label: "col.gp", title: "cflLeaders.gp" }, { key: "att", label: "cflLeaders.attShort", title: "cflLeaders.attPass" }, { key: "comp", label: "cflLeaders.compShort", title: "cflLeaders.comp" },
    { key: "pct", label: "cflLeaders.pctShort", title: "cflLeaders.pct" }, { key: "yds", label: "cflLeaders.ydsShort", title: "cflLeaders.yds" }, { key: "td", label: "cflLeaders.tdShort", title: "cflLeaders.td" },
    { key: "int", label: "cflLeaders.intShort", title: "cflLeaders.int" }, { key: "rating", label: "cflLeaders.ratingShort", title: "cflLeaders.rating" }, { key: "avg", label: "cflLeaders.avgShort", title: "cflLeaders.avgPass" },
    { key: "long", label: "cflLeaders.longShort", title: "cflLeaders.long" },
  ],
  rushing: [
    { key: "gp", label: "col.gp", title: "cflLeaders.gp" }, { key: "att", label: "cflLeaders.carShort", title: "cflLeaders.car" }, { key: "yds", label: "cflLeaders.ydsShort", title: "cflLeaders.yds" },
    { key: "avg", label: "cflLeaders.avgShort", title: "cflLeaders.avgRush" }, { key: "long", label: "cflLeaders.longShort", title: "cflLeaders.long" }, { key: "td", label: "cflLeaders.tdShort", title: "cflLeaders.td" },
    { key: "fum", label: "cflLeaders.fumShort", title: "cflLeaders.fum" },
  ],
  receiving: [
    { key: "gp", label: "col.gp", title: "cflLeaders.gp" }, { key: "rec", label: "cflLeaders.recShort", title: "cflLeaders.rec" }, { key: "yds", label: "cflLeaders.ydsShort", title: "cflLeaders.yds" },
    { key: "avg", label: "cflLeaders.avgShort", title: "cflLeaders.avgRec" }, { key: "long", label: "cflLeaders.longShort", title: "cflLeaders.long" }, { key: "td", label: "cflLeaders.tdShort", title: "cflLeaders.td" },
  ],
  offence: [
    { key: "pass_yds", label: "cflLeaders.passYds", title: "cflLeaders.passYdsTitle" }, { key: "rush_yds", label: "cflLeaders.rushYds", title: "cflLeaders.rushYdsTitle" },
    { key: "rec_yds", label: "cflLeaders.recYds", title: "cflLeaders.recYdsTitle" }, { key: "td", label: "cflLeaders.tdShort", title: "cflLeaders.tdAll" },
  ],
};

/** The article and revision a `source_key` of `enwiki:<title>@<revision id>` names. */
export function articleOf(sourceKey: string): { title: string; revid: number } | null {
  const m = /^enwiki:(.+)@(\d+)$/.exec(sourceKey);
  return m ? { title: m[1], revid: Number(m[2]) } : null;
}

/** The address of an article of English Wikipedia. */
export const articleUrl = (title: string): string => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_")).replace(/%2F/g, "/").replace(/%3A/g, ":").replace(/%28/g, "(").replace(/%29/g, ")").replace(/%2C/g, ",")}`;

/** What a column sorts by: the number a figure starts with ("100T" is 100), else nothing. */
export function figureValue(v: string | null | undefined): number | null {
  if (v == null) return null;
  const m = /^-?\d+(\.\d+)?/.exec(v.trim());
  return m ? Number(m[0]) : null;
}

/** The rows of one club season, in each table's article order, as tables: passing, rushing, receiving, then the combined offence table. */
export function leaderTables(rows: readonly z.infer<typeof leaderRowSchema>[]): LeaderData {
  const tables: LeaderTable[] = [];
  for (const category of LEADER_CATEGORIES) {
    const mine = rows.filter((r) => r.category === category).sort((a, b) => a.ord - b.ord);
    if (!mine.length) continue;
    const keys = LEADER_COLUMNS[category].map((c) => c.key).filter((k) => mine.some((r) => r.stats[k] != null));
    tables.push({ category, keys, lines: mine.map((r) => ({ name: r.name, id: r.person_id, stats: r.stats })) });
  }
  return { tables, article: rows.length ? articleOf(rows[0].source_key) : null };
}
