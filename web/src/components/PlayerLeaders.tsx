import Link from "next/link";
import { Suspense } from "react";
import { SortTable } from "@/components/SortTable";
import { TeamLogo } from "@/components/TeamLogo";
import { TeamLink } from "@/components/ui";
import { queryHref } from "@/components/ViewTabs";
import { abbrFor, type AbbrMap } from "@/lib/abbr";
import { logoFor, type BrandMap } from "@/lib/brand";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import {
  aggregate, barShare, clubGames, groupsOf, leagueRate, PLAYER_SPECS, topPlayers, type PlayerSeason, type PlayerSpec, type RankedPlayer,
} from "@/lib/leaderPlayers";
import { leadersPath } from "@/lib/leaderStats";
import { getNames, getSeasonStats, getSeasonsBeating } from "@/lib/leadersData";
import { LG } from "@/lib/leagues";
import { showStat } from "@/lib/playerStats";
import { parseSort, tableOf, type ColumnSpec } from "@/lib/sort";
import "./leaders.css";

type Query = Record<string, string | string[] | undefined>;

const param = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? "";

/** The leader's place among every club-season in the league's history: one count, asked of the database (a failure just leaves it out). */
const everRank = (lg: string, spec: PlayerSpec, value: number) => getSeasonsBeating(lg, spec.group, spec.col.key, value).then((n) => n + 1, () => null);

async function EverChip({ lg, spec, value }: { lg: string; spec: PlayerSpec; value: number }) {
  const [{ say, fmt }, rank] = await Promise.all([currentSpeaker(), everRank(lg, spec, value)]);
  if (rank == null) return null;
  return <span className={`lchip${rank <= 10 ? " top" : ""}`}>{rank === 1 ? say("leaders.ever.record") : say("leaders.ever.rank", { rank: fmt(rank) })}</span>;
}

async function EverFact({ lg, spec, value }: { lg: string; spec: PlayerSpec; value: number }) {
  const [{ say, fmt }, rank] = await Promise.all([currentSpeaker(), everRank(lg, spec, value)]);
  return (
    <div className={`lfact${rank != null && rank <= 10 ? " top" : ""}`}>
      <b>{rank == null ? "–" : rank === 1 ? say("leaders.record") : `#${fmt(rank)}`}</b>
      <span>{rank == null ? say("load.failed") : say("leaders.ever.fact", { league: LG[lg as keyof typeof LG] ?? lg })}</span>
    </div>
  );
}

/** The player leaders of a NHL or MLB season: a card for each statistic with the top three, then the chosen one's top ten. */
export async function PlayerLeaders({ lg, year, teams, sp, brands, abbrs }: {
  lg: string; year: number; teams: { franchise_id: number; team: string | null; gp: number | null }[]; sp: Query; brands: BrandMap; abbrs: AbbrMap;
}) {
  const { say, fmt } = await currentSpeaker();
  const specs = PLAYER_SPECS[lg] ?? [];
  const groups = groupsOf(specs);
  const fetched = await Promise.all(groups.map((g) => getSeasonStats(lg, year, g.group).catch(() => null)));
  if (fetched.some((f) => f === null)) return <p className="lunavail">{say("load.failed")}</p>;
  if (fetched.every((f) => !f?.length)) return <p className="lunavail">{say("leaders.noPlayerSeason")}</p>;

  const games = clubGames(teams.map((t) => t.gp));
  const clubName = (f: number) => teams.find((t) => t.franchise_id === f)?.team ?? say("team.fallback", { id: f });
  const byGroup = new Map<string, PlayerSeason[]>(groups.map((g, i) => [g.group, aggregate(fetched[i] ?? [], g.group)]));
  const tops = new Map<string, RankedPlayer[]>(specs.map((s) => [s.id, topPlayers(byGroup.get(s.group) ?? [], s, games)]));
  const ids = [...new Set([...tops.values()].flatMap((t) => t.map((r) => r.player.id)))].sort((a, b) => a - b);
  const names = await getNames(ids.join(",")).catch(() => null);
  if (!names) return <p className="lunavail">{say("load.failed")}</p>;

  const path = leadersPath(lg, year);
  const wanted = param(sp.stat);
  const chosen = specs.find((s) => s.id === wanted) ?? specs[0];
  const nameOf = (r: RankedPlayer) => names.get(r.player.id) ?? say("leaders.player.fallback", { id: r.player.id });
  const stat = (s: PlayerSpec) => say(s.col.title as PhraseKey);
  const show = (s: PlayerSpec, v: number) => showStat(s.col.kind, v, fmt);
  const club = (r: RankedPlayer) => r.player.clubs[0];
  const clubAbbr = (r: RankedPlayer) => abbrFor(abbrs, club(r).f, year, clubName(club(r).f));

  const cards = groups.map(({ group, specs: list }) => (
    <div className="lgroup" key={group}>
      <h3>{say(`statgroup.${group}` as PhraseKey)}</h3>
      <div className="lcards">
        {list.map((s) => {
          const top = tops.get(s.id) ?? [];
          const lead = top[0];
          const avg = s.rate ? leagueRate(byGroup.get(s.group) ?? [], s) : null;
          return (
            <Link key={s.id} className="lcard" href={queryHref(path, sp, { view: "players", stat: s.id, sort: null })} prefetch={false} scroll={false} aria-current={s.id === chosen.id ? "page" : undefined}>
              <span className="lname"><span>{stat(s)}</span><span>{say(s.col.label as PhraseKey)}</span></span>
              {lead ? (
                <>
                  <span className="lbig">{show(s, lead.value)}</span>
                  <span className="lwho">
                    <TeamLogo url={logoFor(brands, club(lead).f, year)} size={18} />
                    <span>{nameOf(lead)}</span>
                  </span>
                  <span className="lmore">{clubAbbr(lead)}{lead.player.clubs.length > 1 ? ` +${lead.player.clubs.length - 1}` : ""}</span>
                  <span className="lchips">
                    {s.rate ? (avg != null ? <span className="lchip">{say("leaders.leagueAvg", { value: show(s, avg) })}</span> : null) : (
                      <Suspense fallback={<span className="lchip pending">…</span>}><EverChip lg={lg} spec={s} value={lead.value} /></Suspense>
                    )}
                    {top.filter((r) => r.rank === 1).length > 1 ? <span className="lchip">{say("leaders.tied")}</span> : null}
                  </span>
                  <ol className="ltop">
                    {top.slice(1, 3).map((r) => (
                      <li key={r.player.id}><span>{r.rank}</span><span>{nameOf(r)}</span><b>{show(s, r.value)}</b></li>
                    ))}
                  </ol>
                </>
              ) : <span className="lmore">{say("leaders.notRecorded")}</span>}
            </Link>
          );
        })}
      </div>
    </div>
  ));

  const top = tops.get(chosen.id) ?? [];
  let detail = <p className="lunavail">{say("leaders.notRecorded")}</p>;
  if (top.length) {
    const lead = top[0];
    const best = lead.value, last = top[top.length - 1].value;
    const next = top.find((r) => r.value !== lead.value);
    const margin = next ? Math.abs(lead.value - next.value) : null;
    const everyone = topPlayers(byGroup.get(chosen.group) ?? [], chosen, games, Infinity).length;
    const avg = chosen.rate ? leagueRate(byGroup.get(chosen.group) ?? [], chosen) : null;
    const workload = (p: PlayerSeason) => p.stats.gp ?? p.stats.g ?? 0;
    const cols: ColumnSpec<RankedPlayer>[] = [
      { key: "rk", label: say("leaders.col.rank"), num: true, cls: "rk", get: (r) => r.rank },
      { key: "player", label: say("leaders.col.player"), cls: "team", get: (r) => nameOf(r), cell: (r) => <Link href={`/players/${r.player.id}`} prefetch={false}>{nameOf(r)}</Link> },
      {
        key: "team", label: say("col.team"), cls: "team", get: (r) => clubName(club(r).f),
        cell: (r) => (
          <>
            <TeamLogo url={logoFor(brands, club(r).f, year)} />
            <TeamLink lg={lg} f={club(r).f} name={clubName(club(r).f)} year={year} abbr={clubAbbr(r)} />
            {r.player.clubs.length > 1 ? <span className="dim">{` +${r.player.clubs.length - 1}`}</span> : null}
          </>
        ),
      },
      {
        key: "value", label: say(chosen.col.label as PhraseKey), num: true, title: stat(chosen), get: (r) => r.value,
        cell: (r) => (
          <span className="lval"><span className="lbar" aria-hidden="true"><i style={{ width: `${Math.round(barShare(chosen, r.value, best, last) * 100)}%` }} /></span><b>{show(chosen, r.value)}</b></span>
        ),
      },
      { key: "gp", label: say("stat.gp"), num: true, title: say("stat.gp.name"), get: (r) => workload(r.player) },
    ];
    const table = tableOf(top, cols, (r) => r.player.id, (r) => (r.rank === 1 ? "leadrow" : undefined));
    const sort = parseSort(sp.sort, cols.map((c) => c.key), "rk.asc");
    const tied = top.filter((r) => r.rank === 1).length;
    detail = (
      <>
        <section className="lhero fade" key={chosen.id}>
          <div className="who">
            <span className="kicker">{say(tied > 1 ? "leaders.heroKickerTied" : "leaders.heroKicker", { stat: stat(chosen) })}</span>
            <span className="num">{show(chosen, lead.value)}</span>
            <span className="name">
              <TeamLogo url={logoFor(brands, club(lead).f, year)} size={28} />
              <Link href={`/players/${lead.player.id}`} prefetch={false}>{nameOf(lead)}</Link>
              {tied > 1 ? <span className="dim">{` +${tied - 1}`}</span> : null}
            </span>
            <span className="sub">
              {[
                lead.player.clubs.map((c) => clubName(c.f)).join(" / "),
                say("leaders.player.games", { count: fmt(workload(lead.player)) }),
                margin != null && !chosen.rate ? say(chosen.better === "high" ? "leaders.clearBy" : "leaders.clearByLow", { gap: show(chosen, margin) }) : "",
              ].filter(Boolean).join(" · ")}
            </span>
          </div>
          <div className="lfacts">
            {chosen.rate ? (
              <div className="lfact"><b>{avg != null ? show(chosen, avg) : "–"}</b><span>{say("leaders.fact.leagueAvg", { league: LG[lg as keyof typeof LG] ?? lg })}</span></div>
            ) : (
              <Suspense fallback={<div className="lfact"><b>…</b><span>{say("leaders.ever.fact", { league: LG[lg as keyof typeof LG] ?? lg })}</span></div>}>
                <EverFact lg={lg} spec={chosen} value={lead.value} />
              </Suspense>
            )}
            <div className="lfact">
              <b>{margin != null ? show(chosen, margin) : "–"}</b>
              <span>{say(chosen.better === "high" ? "leaders.fact.margin" : "leaders.fact.marginLow")}</span>
            </div>
            <div className="lfact">
              <b>{show(chosen, last)}</b>
              <span>{say("leaders.fact.tenth", { rank: fmt(top[top.length - 1].rank) })}</span>
            </div>
            <div className="lfact">
              <b>{fmt(everyone)}</b>
              <span>{say("leaders.fact.players")}</span>
            </div>
          </div>
        </section>
        <section className="section">
          <h3>{say("leaders.topTen", { stat: stat(chosen) })}</h3>
          <div className="tablebox ltable"><SortTable {...table} def="rk.asc" initial={sort} /></div>
        </section>
      </>
    );
  }

  const notes: string[] = [];
  if (specs.some((s) => s.rate && s.group === "batting")) notes.push(say("leaders.qual.batting"));
  if (specs.some((s) => s.rate && s.group === "pitching")) notes.push(say("leaders.qual.pitching"));
  if (specs.some((s) => s.rate && s.group === "goalie")) notes.push(say("leaders.qual.goalie"));
  return (
    <>
      <section className="section">
        <h2>{say("leaders.playerTitle")}</h2>
        {cards}
      </section>
      {detail}
      <div className="lnotes">
        <p className="lnote">{say("leaders.playerNotes")}</p>
        {notes.map((n) => <p className="lnote" key={n}>{n}</p>)}
        <p className="lnote">{say("player.statsCredit")}</p>
      </div>
    </>
  );
}
