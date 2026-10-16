import Link from "next/link";
import { Flag } from "@/components/Flag";
import { positionBook } from "@/components/PositionKey";
import { SortTable } from "@/components/SortTable";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import { getPlayerPaths } from "@/lib/playerLinks";
import { showStat, STAT_GROUPS } from "@/lib/playerStats";
import { getRoster, getTeamList, type ListedPlayer, type RosterGroup, type RosterPlayer } from "@/lib/roster";
import { getPositions } from "@/lib/positionData";
import { positionsShort } from "@/lib/positions";
import { tableOf, type ColumnSpec } from "@/lib/sort";
import { countryName } from "@/lib/people-format";
import { countedRoster } from "@/lib/titles";
import { queryHref } from "./ViewTabs";

/** The Titles column, after the name. Left off when the career count could not be read. */
function titleColumn<T extends { titles: number | null }>(
  label: string, title: string, fmt: (n: number) => string, rows: readonly T[],
): ColumnSpec<T>[] {
  if (!rows.some((p) => p.titles != null)) return [];
  return [{ key: "titles", label, title, num: true, get: (p) => p.titles, cell: (p) => (p.titles == null ? "" : fmt(p.titles)) }];
}

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
  if (!everyone.length) {
    const listed = await getTeamList(lg, teamSeasonId);
    return listed.length ? <ListedRoster lg={lg} season={season} listed={listed} path={path} sp={sp} /> : null;
  }
  const { say, fmt, locale } = await currentSpeaker();
  const titles = titleColumn<RosterPlayer>(say("titles.col"), say("titles.career"), fmt, everyone);
  const playerPath = await getPlayerPaths();
  const book = await positionBook();
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
          {[{ key: "", label: say("roster.allPos") }, ...poss.map((x) => ({ key: x, label: x.toUpperCase() }))].map((c) => (
            <Link key={c.key} href={href({ pos: c.key || null })} prefetch={false} title={c.key ? book.name(c.key, [lg]) : undefined} aria-current={c.key === pos ? "page" : undefined}>{c.label}</Link>
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
          ...titles,
          ...(hasPos ? [{ key: "pos", label: say("roster.pos"), get: (p) => positionsShort(p.positions), cell: (p) => book.list(p.positions, null, [lg]) } satisfies ColumnSpec<RosterPlayer>] : []),
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

/**
 * The roster of a club in a league whose player statistics are not archived (NBA, NFL, CFL): one table of the players listed for the season in
 * position order (the league's own list), with the number, the country and the position, and the same position and country filters.
 */
async function ListedRoster({ lg, season, listed, path, sp }: {
  lg: string; season: string; listed: ListedPlayer[]; path: string; sp: Record<string, string | string[] | undefined>;
}) {
  const { say, fmt, locale } = await currentSpeaker();
  const [playerPath, book, positions] = await Promise.all([getPlayerPaths(), positionBook(), getPositions()]);
  const order = new Map(positions.filter((x) => x.league === lg).map((x) => [x.code, x.sort]));
  const shown = countedRoster(listed).sort((a, c) => a.name.localeCompare(c.name, locale));
  const hidden = listed.length - shown.length;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const poss = [...new Set(shown.map((p) => p.pos).filter((x): x is string => !!x))].sort((a, c) => (order.get(a) ?? 999) - (order.get(c) ?? 999) || a.localeCompare(c));
  const nats = [...new Set(shown.map((p) => p.nat).filter((x): x is string => !!x))].sort((a, c) => countryName(a, locale).localeCompare(countryName(c, locale), locale));
  const pos = poss.includes(first(sp.pos)) ? first(sp.pos) : "";
  const nat = nats.includes(first(sp.nat).toUpperCase()) ? first(sp.nat).toUpperCase() : "";
  const players = shown.filter((p) => (!pos || p.pos === pos) && (!nat || p.nat === nat));
  const href = (changes: Record<string, string | null>) => `${queryHref(path, sp, changes)}#roster`;
  const specs: ColumnSpec<ListedPlayer>[] = [
    ...(shown.some((p) => p.nat) ? [{ key: "nat", label: say("roster.nat"), get: (p) => p.nat, cell: (p) => <Flag code={p.nat} /> } satisfies ColumnSpec<ListedPlayer>] : []),
    ...(shown.some((p) => p.number != null) ? [{ key: "no", label: say("roster.number"), num: true, get: (p) => p.number } satisfies ColumnSpec<ListedPlayer>] : []),
    { key: "player", label: say("roster.player"), cls: "team", get: (p) => p.name, cell: (p) => <Link href={playerPath(p.id, p.name, lg)} prefetch={false}>{p.name}</Link> },
    ...titleColumn(say("titles.col"), say("titles.career"), fmt, shown),
    ...(shown.some((p) => p.positions.length) ? [{ key: "pos", label: say("roster.pos"), get: (p) => (p.pos ? (order.get(p.pos) ?? 999) : null), cell: (p) => book.list(p.positions, null, [lg]) } satisfies ColumnSpec<ListedPlayer>] : []),
  ];
  const table = tableOf(players, specs, (p) => p.id);
  return (
    <section className="section" id="roster">
      <h2>{say("roster.title")}</h2>
      {poss.length > 1 ? (
        <nav className="seg views scroll" aria-label={say("roster.filterPos")}>
          {[{ key: "", label: say("roster.allPos") }, ...poss.map((x) => ({ key: x, label: x.toUpperCase() }))].map((c) => (
            <Link key={c.key} href={href({ pos: c.key || null })} prefetch={false} title={c.key ? book.name(c.key, [lg]) : undefined} aria-current={c.key === pos ? "page" : undefined}>{c.label}</Link>
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
      {players.length ? (
        <div className="section">
          <h3>{say("roster.players", { n: players.length })}</h3>
          <div className="tablebox"><SortTable {...table} param="sort_players" def="pos.asc" /></div>
        </div>
      ) : null}
      <p className="note">{say("roster.noteList", { season })}{hidden ? ` ${say("roster.noteHidden")}` : ""}</p>
    </section>
  );
}
