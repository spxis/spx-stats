import Link from "next/link";
import { LeaderSpark } from "@/components/LeaderSpark";
import { LeaderTrend, type TrendPoint } from "@/components/LeaderTrend";
import { SortTable } from "@/components/SortTable";
import { TeamLogo } from "@/components/TeamLogo";
import { TeamLink } from "@/components/ui";
import { queryHref } from "@/components/ViewTabs";
import { abbrFor, type AbbrMap } from "@/lib/abbr";
import type { LeaderStanding } from "@/lib/api/leaders";
import { logoFor, type BrandMap } from "@/lib/brand";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import {
  beats, isTeamStatId, leadersPath, scoreTeams, seasonContext, showDelta, showTeam, teamStatsFor, UNIT_OF, yearLeads, type SeasonIssue, type TeamKind, type TeamStat,
} from "@/lib/leaderStats";
import { LG, seasonLabel } from "@/lib/leagues";
import { recordText } from "@/lib/record";
import { parseSort, tableOf, type ColumnSpec } from "@/lib/sort";
import "./leaders.css";

type Query = Record<string, string | string[] | undefined>;

const param = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? "";

/** The team leaders of a season: a card for each statistic, then the chosen one in full, set against every other season of the league. */
export async function TeamLeaders({ lg, year, all, mine, issue, sp, brands, abbrs, idle }: {
  lg: string; year: number; all: LeaderStanding[]; mine: LeaderStanding[]; issue?: SeasonIssue; sp: Query; brands: BrandMap; abbrs: AbbrMap; idle: number[];
}) {
  const { say, fmt, plural } = await currentSpeaker();
  const path = leadersPath(lg, year);
  const unit = UNIT_OF[lg] ?? "points";
  const stats = teamStatsFor(all);
  const wanted = param(sp.stat);
  const chosen = stats.find((s) => isTeamStatId(wanted) && s.id === wanted) ?? stats[0];
  const items = stats.map((stat) => {
    const history = yearLeads(all, stat);
    return { stat, history, ctx: seasonContext(all, stat, year, history, mine) };
  });
  if (!items.some((i) => i.ctx)) return <p className="lunavail">{say("leaders.noTeams")}</p>;

  const name = (r: LeaderStanding) => r.team ?? say("team.fallback", { id: r.franchise_id });
  const label = (s: TeamStat) => say(s.label(unit));
  const perGame = (s: TeamStat) => (s.kind === "rate" || s.kind === "signed" ? say("leaders.perGame") : "");
  const marginKind = (k: TeamKind): TeamKind => (k === "signed" ? "rate" : k);

  const cards = (
    <div className="lcards">
      {items.map(({ stat, history, ctx }) => (
        <Link key={stat.id} className="lcard" href={queryHref(path, sp, { stat: stat.id, sort: null })} prefetch={false} scroll={false} aria-current={stat.id === chosen.id ? "page" : undefined}>
          <span className="lname"><span>{label(stat)}</span><span>{perGame(stat)}</span></span>
          {ctx ? (
            <>
              <span className="lbig">{showTeam(stat.kind, ctx.lead.value, fmt)}</span>
              <span className="lwho">
                <TeamLogo url={logoFor(brands, ctx.lead.teams[0].franchise_id, year)} size={24} shape="square" />
                <span>{name(ctx.lead.teams[0])}</span>
                {ctx.lead.teams.length > 1 ? <span className="lmore">{`+${ctx.lead.teams.length - 1}`}</span> : null}
              </span>
              <span className="lchips">
                {ctx.partial ? <span className="lchip">{say(issue === "gaps" ? "leaders.gaps" : "leaders.inProgress")}</span> : (
                  <>
                    <span className={`lchip${ctx.rank <= 3 ? " top" : ""}`}>{say("leaders.rankOf", { rank: fmt(ctx.rank), count: fmt(ctx.of) })}</span>
                    {ctx.rank === 1 ? <span className="lchip top">{say("leaders.record")}</span> : <span className="lchip">{say("leaders.topPct", { pct: Math.max(1, 100 - ctx.ahead) })}</span>}
                  </>
                )}
              </span>
              <LeaderSpark points={history.map((h) => ({ year: h.year, value: h.value }))} year={year} />
            </>
          ) : <span className="lmore">{say("leaders.notRecorded")}</span>}
        </Link>
      ))}
    </div>
  );

  const { stat, history, ctx } = items.find((i) => i.stat.id === chosen.id)!;
  let detail = <p className="lunavail">{say("leaders.notRecorded")}</p>;
  if (ctx) {
    const lead = ctx.lead;
    const rows = scoreTeams(mine, stat);
    const thisSeason = rows.map((r) => r.value);
    const ever = all.map((r) => stat.get(r)).filter((v): v is number => v != null && Number.isFinite(v));
    const placeIn = (list: number[], v: number) => list.filter((o) => beats(stat, o, v)).length + 1;
    const best = rows[0].value, last = rows[rows.length - 1].value;
    const link = (r: LeaderStanding, short = false) => <TeamLink lg={lg} f={r.franchise_id} name={name(r)} year={year} abbr={short ? abbrFor(abbrs, r.franchise_id, year, r.team) : undefined} />;
    const cols: ColumnSpec<(typeof rows)[number]>[] = [
      { key: "rk", label: say("leaders.col.rank"), num: true, cls: "rk", get: (r) => placeIn(thisSeason, r.value) },
      { key: "team", label: say("col.team"), cls: "team", get: (r) => r.row.team, cell: (r) => <><TeamLogo url={logoFor(brands, r.row.franchise_id, year)} />{link(r.row, true)}</> },
      {
        key: "value", label: label(stat), num: true, title: perGame(stat) || undefined, get: (r) => r.value,
        cell: (r) => {
          const share = best === last ? 1 : Math.max(0.04, Math.abs(r.value - last) / Math.abs(best - last));
          return <span className="lval"><span className="lbar" aria-hidden="true"><i style={{ width: `${Math.round(share * 100)}%` }} /></span><b>{showTeam(stat.kind, r.value, fmt)}</b></span>;
        },
      },
      { key: "vs", label: say("leaders.col.vsAvg"), num: true, title: say("leaders.col.vsAvgTitle"), get: (r) => r.value - lead.mean, cell: (r) => <span className="dim">{showDelta(stat.kind, r.value - lead.mean)}</span> },
      { key: "gp", label: say("col.gp"), num: true, title: say("col.gpTeamTitle"), get: (r) => r.row.gp },
      { key: "rec", label: say("col.record"), get: (r) => r.row.w, cell: (r) => recordText({ w: r.row.w ?? 0, l: r.row.l ?? 0, t: r.row.t, otl: r.row.otl }) },
      { key: "ever", label: say("leaders.col.ever"), num: true, title: say("leaders.col.everTitle", { count: fmt(ctx.teamOf) }), get: (r) => placeIn(ever, r.value), cell: (r) => <span className="dim">{`#${fmt(placeIn(ever, r.value))}`}</span> },
    ];
    const table = tableOf(rows, cols, (r) => r.row.team_id, (r) => (placeIn(thisSeason, r.value) === 1 ? "leadrow" : undefined));
    const sort = parseSort(sp.sort, cols.map((c) => c.key), "rk.asc");
    const recordYear = ctx.record.row.year;
    const points: TrendPoint[] = history.map((h) => ({
      year: h.year, label: seasonLabel(lg, h.year), value: h.value, worst: h.worst, mean: h.mean,
      teams: h.teams.length > 2 ? `${name(h.teams[0])} +${h.teams.length - 1}` : h.teams.map(name).join(" / "),
    }));
    const clear = ctx.margin != null && ctx.margin > 1e-9 ? showTeam(marginKind(stat.kind), ctx.margin, fmt) : null;
    const tied = lead.teams.length > 1;
    const top = lead.teams[0];
    const leagueName = LG[lg as keyof typeof LG] ?? lg;
    detail = (
      <>
        <section className="lhero fade" key={stat.id}>
          <div className="who">
            <span className="kicker">{say(tied ? "leaders.heroKickerTied" : "leaders.heroKicker", { stat: label(stat) })}</span>
            <span className="num">{showTeam(stat.kind, lead.value, fmt)}{perGame(stat) ? <small>{perGame(stat)}</small> : null}</span>
            <span className="name">
              {lead.teams.slice(0, 3).map((r, i) => (
                <span key={r.team_id}>{i > 0 ? <span className="dim">{" / "}</span> : null}<TeamLogo url={logoFor(brands, r.franchise_id, year)} size={36} shape="square" />{link(r)}</span>
              ))}
              {lead.teams.length > 3 ? <span className="dim">{`+${lead.teams.length - 3}`}</span> : null}
            </span>
            <span className="sub">
              {[
                recordText({ w: top.w ?? 0, l: top.l ?? 0, t: top.t, otl: top.otl }),
                clear ? say(stat.better === "high" ? "leaders.clearBy" : "leaders.clearByLow", { gap: clear }) : "",
                tied ? say("leaders.tiedNote", { count: plural("count.teams", lead.teams.length) }) : "",
              ].filter(Boolean).join(" · ")}
            </span>
          </div>
          <div className="lfacts">
            {ctx.partial ? (
              <div className="lfact wide"><b>{say(issue === "gaps" ? "leaders.gaps" : "leaders.inProgress")}</b><span>{say(issue === "gaps" ? "leaders.gapsNote" : "leaders.inProgressNote")}</span></div>
            ) : (
              <>
                <div className={`lfact${ctx.rank <= 3 ? " top" : ""}`}>
                  <b>{`#${fmt(ctx.rank)}`}<small>{say("leaders.ofSeasons", { count: fmt(ctx.of) })}</small></b>
                  <span>{say("leaders.fact.rank", { league: leagueName })}</span>
                </div>
                <div className="lfact">
                  <b>{`${ctx.ahead}%`}</b>
                  <span>{say("leaders.fact.ahead")}</span>
                </div>
                <div className="lfact">
                  <b>{`#${fmt(ctx.teamRank)}`}<small>{say("leaders.ofTeams", { count: fmt(ctx.teamOf) })}</small></b>
                  <span>{say("leaders.fact.team", { league: leagueName })}</span>
                </div>
              </>
            )}
            <div className={`lfact${ctx.partial ? " wide" : ""}`}>
              <b>{showTeam(stat.kind, ctx.record.value, fmt)}</b>
              <span>
                {say("leaders.fact.record")}{" "}
                <Link href={`${leadersPath(lg, recordYear)}?stat=${stat.id}`} prefetch={false}>{`${name(ctx.record.row)}, ${seasonLabel(lg, recordYear)}`}</Link>
              </span>
            </div>
          </div>
        </section>
        <section className="lpanel">
          <h3>{say("leaders.trend.title", { stat: label(stat) })}</h3>
          <p className="lnote">{say(stat.better === "high" ? "leaders.trend.note" : "leaders.trend.noteLow")}</p>
          <LeaderTrend lg={lg} points={points} year={year} recordYear={recordYear === year ? null : recordYear} kind={stat.kind} stat={label(stat)}
            lowIsBest={stat.better === "low"} idle={idle} statId={stat.id} view="teams" />
        </section>
        <section className="section">
          <h3>{say("leaders.allTeams", { label: seasonLabel(lg, year) })}</h3>
          <div className="tablebox ltable"><SortTable {...table} def="rk.asc" initial={sort} /></div>
        </section>
      </>
    );
  }

  return (
    <>
      <section className="section">
        <h2>{say("leaders.teamTitle")}</h2>
        {cards}
      </section>
      {detail}
      <div className="lnotes">
        <p className="lnote">{say("leaders.teamNotes")}</p>
        {lg === "nhl" ? <p className="lnote">{say("leaders.teamNotesNhl")}</p> : null}
      </div>
    </>
  );
}
