import Link from "next/link";
import { Flag } from "@/components/Flag";
import { SortTable } from "@/components/SortTable";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import { getPlayerPaths } from "@/lib/playerLinks";
import { showStat, STAT_GROUPS } from "@/lib/playerStats";
import { getRoster, type RosterGroup, type RosterPlayer } from "@/lib/roster";
import { tableOf, type ColumnSpec } from "@/lib/sort";
import { countryName } from "@/lib/people-format";
import { queryHref } from "./ViewTabs";

/** The columns each kind of player shows, from lib/playerStats, and the order the table opens in. */
const SHOW = {
  skater: { keys: ["gp", "g", "a", "pts", "pm", "pim"], sort: "pts.desc" },
  goalie: { keys: ["gp", "gs", "w", "l", "t", "otl", "gaa", "svp", "so"], sort: "gp.desc" },
  batting: { keys: ["g", "ab", "r", "h", "hr", "rbi", "sb", "avg", "obp", "slg"], sort: "ab.desc" },
  pitching: { keys: ["w", "l", "era", "g", "gs", "sv", "ip", "so", "whip"], sort: "ip.desc" },
} as const;

const ORDER: RosterGroup[] = ["forwards", "defense", "skaters", "goalies", "batters", "pitchers"];
const TITLE: Record<RosterGroup, PhraseKey> = {
  forwards: "roster.forwards", defense: "roster.defense", skaters: "roster.skaters", goalies: "roster.goalies", batters: "roster.batters", pitchers: "roster.pitchers",
};

/** The players with statistics for a club's season, by position group; nothing at all when there are none. */
export async function TeamRoster({ lg, season, teamSeasonId, path, sp }: {
  lg: string; season: string; teamSeasonId: number; path: string; sp: Record<string, string | string[] | undefined>;
}) {
  const everyone = await getRoster(teamSeasonId);
  if (!everyone.length) return null;
  const { say, fmt, locale } = await currentSpeaker();
  const playerPath = await getPlayerPaths();
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const poss = [...new Set(everyone.map((p) => p.pos).filter((x): x is string => !!x))].sort();
  const nats = [...new Set(everyone.map((p) => p.nat).filter((x): x is string => !!x))].sort((a, c) => countryName(a, locale).localeCompare(countryName(c, locale), locale));
  const pos = poss.includes(first(sp.pos)) ? first(sp.pos) : "";
  const nat = nats.includes(first(sp.nat).toUpperCase()) ? first(sp.nat).toUpperCase() : "";
  const players = everyone.filter((p) => (!pos || p.pos === pos) && (!nat || p.nat === nat));
  const href = (changes: Record<string, string | null>) => `${queryHref(path, sp, changes)}#roster`;
  const blocks = ORDER.flatMap((g) => {
    const mine = players.filter((p) => p.group === g);
    return mine.length ? [{ g, mine }] : [];
  });
  return (
    <section className="section" id="roster">
      <h2>{say("roster.title")}</h2>
      {poss.length > 1 ? (
        <nav className="seg views scroll" aria-label={say("roster.filterPos")}>
          {[{ key: "", label: say("roster.allPos") }, ...poss.map((x) => ({ key: x, label: x }))].map((c) => (
            <Link key={c.key} href={href({ pos: c.key || null })} prefetch={false} aria-current={c.key === pos ? "page" : undefined}>{c.label}</Link>
          ))}
        </nav>
      ) : null}
      {nats.length > 1 ? (
        <nav className="seg views scroll" aria-label={say("roster.filterNat")}>
          {[{ key: "", label: say("roster.allNat") }, ...nats.map((x) => ({ key: x, label: countryName(x, locale) }))].map((c) => (
            <Link key={c.key} href={href({ nat: c.key || null })} prefetch={false} aria-current={c.key === nat ? "page" : undefined}>{c.key ? <Flag code={c.key} shape="round" /> : null}{c.label}</Link>
          ))}
        </nav>
      ) : null}
      {!players.length ? <p className="note">{say("roster.noneMatch")}</p> : null}
      {blocks.map(({ g, mine }) => {
        const kind = mine[0].kind;
        const group = STAT_GROUPS[kind];
        const cols = SHOW[kind].keys.flatMap((k) => group.cols.filter((c) => c.key === k)).filter((c) => mine.some((p) => c.get(p.stats) != null));
        const hasPos = mine.some((p) => p.pos);
        const hasNat = mine.some((p) => p.nat);
        const specs: ColumnSpec<RosterPlayer>[] = [
          ...(hasNat ? [{ key: "nat", label: say("roster.nat"), get: (p) => p.nat, cell: (p) => <Flag code={p.nat} /> } satisfies ColumnSpec<RosterPlayer>] : []),
          { key: "player", label: say("roster.player"), cls: "team", get: (p) => p.name, cell: (p) => <Link href={playerPath(p.id, p.name, lg)} prefetch={false}>{p.name}</Link> },
          ...(hasPos ? [{ key: "pos", label: say("roster.pos"), get: (p) => p.allPos } satisfies ColumnSpec<RosterPlayer>] : []),
          ...cols.map((c): ColumnSpec<RosterPlayer> => ({
            key: c.key, label: say(c.label as PhraseKey), title: say(c.title as PhraseKey), num: true,
            get: (p) => c.get(p.stats), cell: (p) => showStat(c.kind, c.get(p.stats), fmt),
          })),
        ];
        const table = tableOf(mine, specs, (p) => p.id);
        return (
          <div key={g} className="section">
            <h3>{say(TITLE[g], { n: mine.length })}</h3>
            <div className="tablebox"><SortTable {...table} param={`sort_${g}`} def={SHOW[kind].sort} /></div>
          </div>
        );
      })}
      <p className="note">{say("roster.note", { season })}</p>
    </section>
  );
}
