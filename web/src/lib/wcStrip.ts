import type { StripTeam } from "./soccerStrip.ts";

/** One team of the strip under a tournament's heading as the page sends it: [id, anchor, code, slug, 1 when the page holds its squad, name, flag, stage, tier]. */
export type StripLine = [id: string, anchor: string, code: string, slug: string, squad: 0 | 1, name: string, flag: string | null, stage: string, tier: number];

export const stripLines = (teams: readonly StripTeam[]): StripLine[] => teams.map((t) => [t.id, t.anchor, t.code, t.slug, t.squad ? 1 : 0, t.name, t.flag, t.stage, t.tier]);
