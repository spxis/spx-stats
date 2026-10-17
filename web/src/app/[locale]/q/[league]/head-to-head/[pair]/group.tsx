import type { Metadata } from "next";
import Link from "@/components/Link";
import { AccentStyle } from "@/components/AccentStyle";
import { SortTable } from "@/components/SortTable";
import { TeamLabel } from "@/components/TeamLabel";
import { queryHref } from "@/components/ViewTabs";
import { Figures } from "@/components/ui";
import "@/components/h2h.css";
import { getAlignment } from "@/lib/alignmentData";
import { logoFor } from "@/lib/brand";
import { getBrands } from "@/lib/data";
import { fmt3 } from "@/lib/format";
import { pairPath, parseH2hQuery, tally } from "@/lib/h2h";
import { getTeamHistory } from "@/lib/h2hData";
import { GROUP_IDS, groupGames, groupPath, memberTallies, placeIndex, seasonTallies, type GroupId } from "@/lib/h2hGroup";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import { isLeague, LG, seasonLabel, type LeagueCode } from "@/lib/leagues";
import { share } from "@/lib/loc";
import { pageMeta } from "@/lib/meta";
import { recordText } from "@/lib/record";
import { parseSort, tableOf } from "@/lib/sort";
import { getLeagueClubs, getPaths } from "@/lib/teamSlugs";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function load(lg: LeagueCode, f: number) {
  const [history, alignment, clubs, paths, brands] = await Promise.all([getTeamHistory(lg, f), getAlignment(lg).catch(() => []), getLeagueClubs(lg), getPaths(), getBrands()]);
  return { history, places: placeIndex(alignment), clubs, paths, brands };
}

export async function groupMeta(lg: string, f: number, group: GroupId, path: string): Promise<Metadata> {
  if (!isLeague(lg)) return {};
  const { say, locale } = await currentSpeaker();
  const clubs = await getLeagueClubs(lg);
  const team = clubs.find((c) => c.f === f)?.name ?? say("team.fallback", { id: f });
  return pageMeta({
    title: say("h2h.group.metaTitle", { team, group: say(`h2h.group.of.${group}` as PhraseKey), league: LG[lg] }),
    description: say("h2h.group.title", { team, group: say(`h2h.group.of.${group}` as PhraseKey) }),
    path, locale,
  });
}

/** A club against its division, the rest of its conference, the other conferences or the whole league. */
export async function GroupPage({ lg, f, group, path, sp }: { lg: LeagueCode; f: number; group: GroupId; path: string; sp: Record<string, string | string[] | undefined> }) {
  const { say, plural, fmt } = await currentSpeaker();
  const eyebrow = <span className="eyebrow"><Link href={`/${lg}`}>{LG[lg]}</Link>{" · "}{say("h2h.eyebrow")}</span>;
  let d: Awaited<ReturnType<typeof load>>;
  try {
    d = await load(lg, f);
  } catch {
    return <><AccentStyle league={lg} /><section className="head fade">{eyebrow}<h1>{say("h2h.eyebrow")}</h1></section><p className="note">{say("load.failed")}</p></>;
  }
  const { paths, clubs } = d;
  const nameOf = (c: number) => clubs.find((x) => x.f === c)?.name ?? say("team.fallback", { id: c });
  const team = nameOf(f);
  const groupName = say(`h2h.group.of.${group}` as PhraseKey);
  const q = parseH2hQuery(sp, lg);
  const unit = say(({ nhl: "unit.goals", pwhl: "unit.goals", nba: "unit.points", wnba: "unit.points", mlb: "unit.runs", nfl: "unit.points", cfl: "unit.points", nwsl: "unit.goals", afl: "unit.points", aafc: "unit.points", nha: "unit.goals", pcha: "unit.goals", wchl: "unit.goals", wha: "unit.goals" } as const)[lg]);

  const all = groupGames(lg, d.history, f, group, d.places);
  const hasPlayoffs = all.some((g) => g.ph === "playoffs"), hasRegular = all.some((g) => g.ph === "regular");
  const phase = hasPlayoffs && hasRegular ? q.phase : "all";
  const picked = all.filter((g) => (phase === "all" || g.ph === phase) && (q.loc === "all" || (q.loc === "home" ? g.aHome : !g.aHome)));
  const t = tally(picked, lg);

  const head = (
    <section className="head fade">
      {eyebrow}
      <h1>{say("h2h.group.title", { team, group: groupName })}</h1>
      <nav className="seg views" aria-label={say("h2h.group.aria")}>
        {GROUP_IDS.map((g) => (
          <Link key={g} href={queryHref(groupPath(paths, lg, f, g), sp, {})} prefetch={false} aria-current={g === group ? "page" : undefined}>{say(`h2h.group.${g}` as PhraseKey)}</Link>
        ))}
      </nav>
    </section>
  );

  if (!all.length) {
    return (
      <>
        <AccentStyle league={lg} />
        {head}
        <p className="note">{say("h2h.group.none", { team, group: groupName })}</p>
        <p><Link href={paths.team(lg, f)}>{say("tseason.allSeasons")}</Link></p>
      </>
    );
  }

  const hrefTo = (changes: Record<string, string | null>) => queryHref(path, sp, changes);
  const controls = (
    <div className="h2hcontrols">
      {hasPlayoffs && hasRegular ? (
        <nav className="seg views" aria-label={say("phase.aria")}>
          {([["all", "phase.all"], ["regular", "phase.regular"], ["playoffs", "phase.playoffs"]] as const).map(([k, label]) => (
            <Link key={k} href={hrefTo({ phase: k === "all" ? null : k })} prefetch={false} scroll={false} aria-current={k === phase ? "page" : undefined}>{say(label)}</Link>
          ))}
        </nav>
      ) : null}
      <nav className="seg views" aria-label={say("loc.aria")}>
        {([["all", say("loc.all")], ["home", say("h2h.locHome", { team })], ["road", say("h2h.locRoad", { team })]] as const).map(([k, label]) => (
          <Link key={k} href={hrefTo({ loc: k === "all" ? null : k })} prefetch={false} scroll={false} aria-current={k === q.loc ? "page" : undefined}>{label}</Link>
        ))}
      </nav>
    </div>
  );

  if (!picked.length) {
    return <><AccentStyle league={lg} />{head}{controls}<p className="note">{say("h2h.noMatch")}</p><p><Link href={path}>{say("h2h.reset")}</Link></p></>;
  }

  const sh = share(t.a);
  const figs: [string, number | string][] = [
    [say("fig.games"), t.gp],
    [say("h2h.col.record", { team }), recordText(t.a)],
    [say("fig.share"), sh == null ? "–" : fmt3(sh)],
    [unit, `${fmt(t.af)} – ${fmt(t.bf)}`],
  ];

  const place = (y: number) => {
    const p = d.places.get(`${y}|${f}`);
    return (group === "division" ? p?.division : p?.conference) ?? "";
  };
  const seasons = seasonTallies(picked, lg);
  const seasonTable = tableOf(seasons, [
    { key: "season", label: say("col.season"), cls: "seasoncell", get: (s: (typeof seasons)[number]) => s.year, cell: (s: (typeof seasons)[number]) => <Link href={paths.teamSeason(lg, f, s.year)} prefetch={false}>{seasonLabel(lg, s.year)}</Link> },
    ...(group === "league" ? [] : [{ key: "place", label: say("h2h.group.col.place"), cls: "team", get: (s: (typeof seasons)[number]) => place(s.year), cell: (s: (typeof seasons)[number]) => place(s.year) }]),
    { key: "gp", label: say("col.gp"), num: true, get: (s: (typeof seasons)[number]) => s.t.gp, cell: (s: (typeof seasons)[number]) => fmt(s.t.gp) },
    { key: "rec", label: say("h2h.col.record", { team }), num: true, title: say("h2h.col.recordTitle"), get: (s: (typeof seasons)[number]) => share(s.t.a), cell: (s: (typeof seasons)[number]) => recordText(s.t.a) },
    { key: "share", label: say("col.share"), num: true, get: (s: (typeof seasons)[number]) => share(s.t.a), cell: (s: (typeof seasons)[number]) => { const v = share(s.t.a); return v == null ? "" : fmt3(v); } },
    { key: "af", label: `${unit} +`, num: true, get: (s: (typeof seasons)[number]) => s.t.af, cell: (s: (typeof seasons)[number]) => fmt(s.t.af) },
    { key: "bf", label: `${unit} −`, num: true, get: (s: (typeof seasons)[number]) => s.t.bf, cell: (s: (typeof seasons)[number]) => fmt(s.t.bf) },
  ], (s) => s.year);

  const members = memberTallies(picked, lg);
  type M = (typeof members)[number];
  const memberTable = tableOf(members, [
    { key: "opp", label: say("h2h.group.col.opp"), cls: "team", get: (m: M) => nameOf(m.f), cell: (m: M) => <TeamLabel lg={lg} f={m.f} name={nameOf(m.f)} href={pairPath(paths, lg, f, m.f).path} logo={logoFor(d.brands, m.f)} /> },
    { key: "gp", label: say("col.gp"), num: true, get: (m: M) => m.t.gp, cell: (m: M) => fmt(m.t.gp) },
    { key: "rec", label: say("h2h.col.record", { team }), num: true, title: say("h2h.col.recordTitle"), get: (m: M) => share(m.t.a), cell: (m: M) => recordText(m.t.a) },
    { key: "share", label: say("col.share"), num: true, get: (m: M) => share(m.t.a), cell: (m: M) => { const v = share(m.t.a); return v == null ? "" : fmt3(v); } },
    { key: "af", label: `${unit} +`, num: true, get: (m: M) => m.t.af, cell: (m: M) => fmt(m.t.af) },
    { key: "bf", label: `${unit} −`, num: true, get: (m: M) => m.t.bf, cell: (m: M) => fmt(m.t.bf) },
    { key: "years", label: say("h2h.group.col.years"), num: true, get: (m: M) => m.years.length, cell: (m: M) => `${seasonLabel(lg, m.years[0])}–${seasonLabel(lg, m.years[m.years.length - 1])}` },
  ], (m) => m.f);

  const sortSeasons = parseSort(one(sp.sort_seasons), seasonTable.columns.map((c) => c.key), "season.desc");
  const sortMembers = parseSort(one(sp.sort_members), memberTable.columns.map((c) => c.key), "gp.desc");

  return (
    <>
      <AccentStyle league={lg} />
      {head}
      <p className="lede">{say("h2h.group.lede", { games: plural("count.games", t.gp), group: groupName, first: seasonLabel(lg, picked[0].year), last: seasonLabel(lg, picked[picked.length - 1].year) })}</p>
      {controls}
      <Figures items={figs} />
      <section className="section">
        <h2>{say("h2h.seasons.title")}</h2>
        <p className="note">{say("h2h.group.seasonsNote", { team })}</p>
        <div className="tablebox"><SortTable {...seasonTable} param="sort_seasons" def="season.desc" initial={sortSeasons} label={say("h2h.seasons.title")} /></div>
      </section>
      <section className="section">
        <h2>{say("h2h.group.membersTitle")}</h2>
        <p className="note">{say("h2h.group.membersNote")}</p>
        <div className="tablebox"><SortTable {...memberTable} param="sort_members" def="gp.desc" initial={sortMembers} label={say("h2h.group.membersTitle")} /></div>
      </section>
    </>
  );
}
