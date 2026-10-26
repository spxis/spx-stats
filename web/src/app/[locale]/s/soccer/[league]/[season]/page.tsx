import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { EuropeClubName, EuropeCredit } from "@/components/EuropeBits";
import { FamilyNav } from "@/components/FamilyNav";
import { PlaceMedal } from "@/components/PlaceMedal";
import { SortTable } from "@/components/SortTable";
import { Figures } from "@/components/ui";
import { getEuropeMatches, getEuropeSeason, getEuropeStandings, getMovesFrom, getMovesInto, hasContent, type EuroMatch } from "@/lib/europe";
import { europeLeaguePath, leagueOfSlug, seasonLabel, yearOfSeasonLabel } from "@/lib/europePath";
import { clubCode, crossTable, tableFromMatches } from "@/lib/europeView";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { tableOf } from "@/lib/sort";
import "@/components/soccer.css";

export const revalidate = 2592000;

// Nothing is drawn at build time: each season is drawn on its first visit, then kept and revalidated like the rest.
export const generateStaticParams = () => [];

type Params = PageProps<"/[locale]/s/soccer/[league]/[season]">;

async function find(p: Awaited<Params["params"]>) {
  const code = leagueOfSlug(p.league);
  const year = yearOfSeasonLabel(p.season);
  const s = code && year != null ? await getEuropeSeason(code, year) : null;
  return s && hasContent(s) ? { code: code!, s } : null;
}

export const generateMetadata = guardMeta(async ({ params }: Params): Promise<Metadata> => {
  const p = await params;
  const f = await find(p);
  if (!f) return {};
  const { say, locale } = await currentSpeaker();
  const description = f.s.champion ? say("europe.s.metaDesc", { title: f.s.name, champion: f.s.champion }) : say("europe.s.metaDescPlain", { title: f.s.name });
  return pageMeta({ title: f.s.name, description, path: `/soccer/${p.league}/${p.season}`, locale });
});

interface Line {
  team_id: string; slug: string; name: string; pos: number; played: number | null; wins: number | null; draws: number | null; losses: number | null;
  gf: number | null; ga: number | null; gd: number | null; points: number | null; notes: string | null;
}

/** One season of a European division: the league table (Wikipedia's when we hold it, else worked out from the results), promotion and relegation, the results as a grid and any play-offs. */
export default guard(async function EuropeSeasonPage({ params }: Params) {
  const p = await params;
  const f = await find(p);
  if (!f) notFound();
  const { code, s } = f;
  const { say, fmt, dt } = await currentSpeaker();
  const [matches, standings, movesOut, movesIn] = await Promise.all([
    s.matches || s.playoff_matches ? getEuropeMatches(s.tournament_id) : Promise.resolve([] as EuroMatch[]),
    s.has_table ? getEuropeStandings(s.tournament_id) : Promise.resolve([]),
    getMovesFrom(code, s.year), getMovesInto(code, s.year),
  ]);

  const names = new Map<string, { name: string; slug: string }>();
  for (const m of matches) { names.set(m.home_team_id, { name: m.home, slug: m.home_slug }); names.set(m.away_team_id, { name: m.away, slug: m.away_slug }); }
  let lines: Line[];
  const fromTable = standings.length > 0;
  if (fromTable) {
    lines = standings.map((r) => ({
      team_id: r.team_id, slug: r.team_slug, name: r.team_name ?? r.team, pos: r.position, played: r.played, wins: r.wins, draws: r.draws, losses: r.losses,
      gf: r.goals_for, ga: r.goals_against, gd: r.goal_difference, points: r.points, notes: r.qualification ?? null,
    }));
  } else {
    lines = tableFromMatches(matches, s.system_key, s.year).map((r, i) => ({
      team_id: r.team_id, slug: names.get(r.team_id)?.slug ?? "", name: names.get(r.team_id)?.name ?? r.team_id, pos: i + 1, played: r.played, wins: r.wins, draws: r.draws,
      losses: r.losses, gf: r.goals_for, ga: r.goals_against, gd: r.goal_difference, points: r.points, notes: null,
    }));
  }
  const out = new Map(movesOut.map((m) => [m.team_id, m.move]));
  const inn = new Map(movesIn.map((m) => [m.team_id, m.move]));
  const byId = new Map(lines.map((l) => [l.team_id, l]));
  const nameList = (ids: string[]) => ids.map((id) => byId.get(id)).filter((l): l is Line => !!l).sort((a, b) => a.pos - b.pos);
  const relegated = nameList([...out].filter(([, mv]) => mv === "relegated").map(([id]) => id));
  const promoted = nameList([...inn].filter(([, mv]) => mv === "promoted").map(([id]) => id));
  const cameDown = nameList([...inn].filter(([, mv]) => mv === "relegated").map(([id]) => id));
  const clubs = (list: Line[]) => list.map((l, i) => <span key={l.team_id}>{i ? ", " : ""}{l.slug ? <EuropeClubName slug={l.slug} name={l.name} /> : l.name}</span>);
  const moveText = (mv: string | null | undefined) => (mv === "promoted" ? say("europe.move.promoted") : mv === "relegated" ? say("europe.move.relegated") : mv === "stayed" ? "" : "");

  const table = tableOf(lines, [
    { key: "pos", label: say("europe.col.pos"), num: true, get: (l) => l.pos },
    { key: "team", label: say("col.team"), cls: "team", get: (l) => l.name, cell: (l) => (l.slug ? <EuropeClubName slug={l.slug} name={l.name} /> : l.name) },
    { key: "p", label: say("wc.col.played"), title: say("wc.col.playedTitle"), num: true, get: (l) => l.played },
    { key: "w", label: say("wc.col.w"), num: true, get: (l) => l.wins },
    { key: "d", label: say("wc.col.d"), num: true, get: (l) => l.draws },
    { key: "l", label: say("wc.col.l"), num: true, get: (l) => l.losses },
    { key: "gf", label: say("wc.col.gf"), num: true, get: (l) => l.gf },
    { key: "ga", label: say("wc.col.ga"), num: true, get: (l) => l.ga },
    { key: "gd", label: say("europe.col.gd"), num: true, get: (l) => l.gd, cell: (l) => (l.gd == null ? "" : l.gd > 0 ? `+${fmt(l.gd)}` : fmt(l.gd)) },
    { key: "pts", label: say("col.pts"), num: true, get: (l) => l.points },
    {
      key: "next", label: say("europe.col.next"), cls: "team", get: (l) => out.get(l.team_id) ?? null,
      cell: (l) => { const mv = out.get(l.team_id); return mv === "promoted" || mv === "relegated" ? <span className={`eu-move-${mv}`}>{moveText(mv)}</span> : ""; },
    },
    ...(fromTable ? [{ key: "notes", label: say("europe.col.notes"), cls: "team", nosort: true, get: (l: Line) => l.notes, cell: (l: Line) => l.notes ?? "" }] : []),
  ], (l) => l.team_id);

  const day = (iso: string) => dt.ymd(new Date(iso));
  const dates = s.start_date && s.end_date ? `${day(s.start_date)} – ${day(s.end_date)}` : seasonLabel(s.year);
  const regular = matches.filter((m) => m.stage_key === "regular");
  const playoff = matches.filter((m) => m.stage_key !== "regular");
  const cell = crossTable(regular);
  const order = lines.filter((l) => regular.some((m) => m.home_team_id === l.team_id || m.away_team_id === l.team_id));
  const per = s.matches ? Math.round((s.goals / s.matches) * 100) / 100 : 0;

  return (
    <div className="soccer">
      <section className="head fade">
        <span className="eyebrow">{s.league_name}</span>
        <h1>{s.name}</h1>
        <FamilyNav family="soccer" europe={code} />
        <p className="lede">{say("europe.s.lede", { teams: s.team_count ?? lines.length, dates })}</p>
        <p className="note"><Link href={europeLeaguePath(code)}>{say("europe.s.all", { league: s.league_name })}</Link></p>
      </section>
      {s.note ? <section className="section"><p className="note">{s.note}</p></section> : null}
      <Figures items={[
        [say("wc.col.teams"), s.team_count ?? lines.length],
        ...(s.matches ? [[say("wc.col.matches"), s.matches + s.playoff_matches] as [string, number], [say("wc.col.goals"), s.goals] as [string, number], [say("wc.t.perMatch"), fmt(per)] as [string, string]] : []),
      ]} />
      {s.champion && s.champion_slug ? (
        <section className="section">
          <ul className="sc-list">
            <li><PlaceMedal place={1} /><b>{say("europe.champion")}</b> <EuropeClubName slug={s.champion_slug} name={s.champion} /></li>
            {s.runner_up && s.runner_up_slug ? <li><PlaceMedal place={2} /><b>{say("europe.runnerUp")}</b> <EuropeClubName slug={s.runner_up_slug} name={s.runner_up} /></li> : null}
          </ul>
        </section>
      ) : null}
      {lines.length ? (
        <section className="section scroll" id="table">
          <h2>{say("europe.s.table")}</h2>
          <div className="tablebox"><SortTable {...table} def="pos.asc" param="sort_teams" /></div>
          <p className="note">{fromTable ? say("europe.s.wikiTable") : say("europe.s.computed")}</p>
        </section>
      ) : null}
      {relegated.length || promoted.length || cameDown.length ? (
        <section className="section" id="moves">
          <h2>{say("europe.s.moves")}</h2>
          <ul className="sc-list">
            {promoted.length ? <li><b>{say("europe.s.promoted")}</b>: {clubs(promoted)}.</li> : null}
            {cameDown.length ? <li><b>{say("europe.s.relegatedIn")}</b>: {clubs(cameDown)}.</li> : null}
            {relegated.length ? <li><b>{say("europe.s.relegated")}</b>: {clubs(relegated)}.</li> : null}
          </ul>
          <p className="note">{say("europe.s.movesNote")}</p>
        </section>
      ) : null}
      {regular.length ? (
        <section className="section scroll" id="results">
          <h2>{say("europe.s.results")}</h2>
          <div className="tablebox">
            <table className="eu-grid">
              <thead>
                <tr><th />{order.map((l) => <th key={l.team_id} title={l.name}>{clubCode(l.name)}</th>)}</tr>
              </thead>
              <tbody>
                {order.map((h) => (
                  <tr key={h.team_id}>
                    <th className="rowhead" scope="row">{h.slug ? <EuropeClubName slug={h.slug} name={h.name} /> : h.name}</th>
                    {order.map((a) => {
                      if (a.team_id === h.team_id) return <td key={a.team_id} className="self" />;
                      const r = cell(h.team_id, a.team_id);
                      return <td key={a.team_id}>{r ? `${r.hg}–${r.ag}` : ""}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">{say("europe.s.resultsNote")}</p>
        </section>
      ) : null}
      {playoff.length ? (
        <section className="section" id="playoffs">
          <h2>{say("europe.s.playoffs")}</h2>
          <ul className="sc-list">
            {playoff.map((m) => (
              <li key={m.match_id}>
                {day(m.match_date)} · <EuropeClubName slug={m.home_slug} name={m.home} /> <b>{m.home_goals}–{m.away_goals}</b> <EuropeClubName slug={m.away_slug} name={m.away} />
                {m.shootout && m.home_penalties != null ? ` (${say("europe.s.shootout", { pens: `${m.home_penalties}–${m.away_penalties}` })})` : m.extra_time ? ` ${say("wc.aetShort")}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {!s.matches && !lines.length ? <section className="section"><p className="note">{say("europe.s.noMatches")}</p></section> : null}
      <section className="section"><EuropeCredit say={say} /></section>
    </div>
  );
});
