import Link from "@/components/Link";
import { Flag } from "@/components/Flag";
import { positionBook } from "@/components/PositionKey";
import { RosterTable } from "@/components/RosterTable";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import { getPlayerPaths } from "@/lib/playerLinks";
import { STAT_GROUPS } from "@/lib/playerStats";
import { getRoster, getTeamList, type ListedPlayer, type RosterGroup } from "@/lib/roster";
import { getPositions } from "@/lib/positionData";
import { countryName } from "@/lib/people-format";
import { countedRoster } from "@/lib/titles";
import { hasFlag } from "@/lib/flagCodes";
import { playerPath } from "@/lib/playerPath";
import { wire, type RosterCol, type RosterLine, type RosterTableData } from "@/lib/rosterWire";
import { queryHref } from "./ViewTabs";

/** The Titles column, after the name. Left off when the career count could not be read. */
function titleColumn(label: string, title: string, rows: readonly { titles: number | null }[]): RosterCol[] {
  if (!rows.some((p) => p.titles != null)) return [];
  return [{ key: "titles", label, title, type: "titles" }];
}

/** The page's address for a player when it is not the usual `/<league>/player/<name>-<id>` (a person filed under another league), else null. */
function otherHref(paths: (id: number, name: string, league?: string | null) => string, lg: string, id: number, name: string): string | null {
  const h = paths(id, name, lg);
  return h === playerPath(lg, id, name) ? null : h;
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

/** Each roster table draws this many players (of the sort in force) until Show all; ?full=1 draws them all, for a reader without script. */
export const ROSTER_HEAD = 15;

/** The players with statistics for a club's season, by position group; nothing at all when there are none. */
export async function TeamRoster({ lg, season, teamSeasonId, path, sp }: {
  lg: string; season: string; teamSeasonId: number; path: string; sp: Record<string, string | string[] | undefined>;
}) {
  const everyone = await getRoster(teamSeasonId);
  if (!everyone.length) {
    const listed = await getTeamList(lg, teamSeasonId);
    return listed.length ? <ListedRoster lg={lg} season={season} listed={listed} path={path} sp={sp} /> : null;
  }
  const { say, locale } = await currentSpeaker();
  const titles = titleColumn(say("titles.col"), say("titles.career"), everyone);
  const paths = await getPlayerPaths();
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
        const colList: RosterCol[] = [
          ...(hasNat ? [{ key: "nat", label: say("roster.nat"), type: "nat" } satisfies RosterCol] : []),
          { key: "player", label: say("roster.player"), type: "player" },
          ...titles,
          ...(hasPos ? [{ key: "pos", label: say("roster.pos"), type: "pos" } satisfies RosterCol] : []),
          ...cols.map((c, slot): RosterCol => ({ key: c.key, label: say(c.label as PhraseKey), title: say(c.title as PhraseKey), type: "stat", kind: c.kind, slot })),
        ];
        const names: Record<string, string | null> = {};
        const lines = mine.map((p): RosterLine => {
          const codes = book.items(p.positions, null, [lg]);
          for (const x of codes) names[x.code] = x.name;
          return [p.id, p.name, p.nat, p.titles, codes.map((x) => x.code), otherHref(paths, lg, p.id, p.name), cols.map((c) => wire(c.get(p.stats)))];
        });
        const data: RosterTableData = { lg, def: SHOW[kind].sort, param: `sort_${g}`, cols: colList, lines, names, flags: [...new Set(mine.map((p) => p.nat).filter((x): x is string => hasFlag(x)))] };
        return (
          <div key={g} className="section">
            <h3>{say(TITLE[g], { n: mine.length })}</h3>
            <div className="tablebox"><RosterTable data={data} limit={sp.full === "1" ? undefined : ROSTER_HEAD} allHref={`${queryHref(path, sp, { full: "1" })}#roster`} /></div>
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
  const { say, locale } = await currentSpeaker();
  const [paths, book, positions] = await Promise.all([getPlayerPaths(), positionBook(), getPositions()]);
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
  const colList: RosterCol[] = [
    ...(shown.some((p) => p.nat) ? [{ key: "nat", label: say("roster.nat"), type: "nat" } satisfies RosterCol] : []),
    ...(shown.some((p) => p.number != null) ? [{ key: "no", label: say("roster.number"), type: "num", slot: 0 } satisfies RosterCol] : []),
    { key: "player", label: say("roster.player"), type: "player" },
    ...titleColumn(say("titles.col"), say("titles.career"), shown),
    ...(shown.some((p) => p.positions.length) ? [{ key: "pos", label: say("roster.pos"), type: "posrank", slot: 1 } satisfies RosterCol] : []),
  ];
  const names: Record<string, string | null> = {};
  const lines = players.map((p): RosterLine => {
    const codes = book.items(p.positions, null, [lg]);
    for (const x of codes) names[x.code] = x.name;
    return [p.id, p.name, p.nat, p.titles, codes.map((x) => x.code), otherHref(paths, lg, p.id, p.name), [p.number, p.pos ? (order.get(p.pos) ?? 999) : null]];
  });
  const data: RosterTableData = { lg, def: "pos.asc", param: "sort_players", cols: colList, lines, names, flags: [...new Set(players.map((p) => p.nat).filter((x): x is string => hasFlag(x)))] };
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
          <div className="tablebox"><RosterTable data={data} limit={sp.full === "1" ? undefined : ROSTER_HEAD} allHref={`${queryHref(path, sp, { full: "1" })}#roster`} /></div>
        </div>
      ) : null}
      <p className="note">{say("roster.noteList", { season })}{hidden ? ` ${say("roster.noteHidden")}` : ""}</p>
    </section>
  );
}
