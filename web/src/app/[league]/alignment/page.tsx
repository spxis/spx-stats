import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { AlignmentSeasonSelect } from "@/components/AlignmentSeasonSelect";
import { AlignmentTimeline, type TimelineLane } from "@/components/AlignmentTimeline";
import "@/components/alignment.css";
import { lanesOf, moveText, yearSchema, type AlignmentChangeRow, type AlignmentRow } from "@/lib/alignment";
import { getAlignment, getAlignmentChanges } from "@/lib/alignmentData";
import { getSummary } from "@/lib/data";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, LG, seasonLabel } from "@/lib/leagues";
import type { Speaker } from "@/lib/i18n/i18n";
import { pageMeta } from "@/lib/meta";

type Say = Speaker["say"];

export async function generateMetadata({ params }: PageProps<"/[league]/alignment">): Promise<Metadata> {
  const { league } = await params;
  if (!isLeague(league)) return {};
  const { say, locale } = await currentSpeaker();
  return pageMeta({
    title: say("align.metaTitle", { league: LG[league] }),
    description: say("align.metaDesc", { league: LG[league] }),
    path: `/${league}/alignment`,
    locale,
  });
}

/** The conferences of one season with their divisions and clubs (a conference without divisions lists its clubs directly). */
function season(rows: AlignmentRow[]) {
  const conf = new Map<string, Map<string, AlignmentRow[]>>();
  for (const r of rows) {
    const c = r.conference ?? "";
    const d = r.division ?? "";
    const divs = conf.get(c) ?? new Map<string, AlignmentRow[]>();
    divs.set(d, [...(divs.get(d) ?? []), r]);
    conf.set(c, divs);
  }
  return [...conf.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, divs]) => ({
    name,
    divisions: [...divs.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([d, clubs]) => ({ name: d, clubs: clubs.sort((a, b) => (a.team ?? "").localeCompare(b.team ?? "")) })),
  }));
}

function laneLabels(say: Say, lanes: ReturnType<typeof lanesOf>) {
  const dupe = new Map<string, number>();
  for (const l of lanes) dupe.set(l.division ?? "", (dupe.get(l.division ?? "") ?? 0) + 1);
  return lanes.map((l) => {
    const base = l.division ?? (l.conference ? say("align.noDivisions") : "");
    return !l.division || (dupe.get(base) ?? 0) < 2 || !l.conference ? base : `${base} (${l.short && l.conference ? l.conference.replace(/ Conference$/, "") : l.conference})`;
  });
}

export default async function AlignmentPage({ params, searchParams }: PageProps<"/[league]/alignment">) {
  const { league: lg } = await params;
  if (!isLeague(lg)) notFound();
  const sp = await searchParams;
  const { say } = await currentSpeaker();
  const [rows, changes, summary] = await Promise.all([getAlignment(lg), getAlignmentChanges(lg), getSummary()]);
  const head = (
    <section className="head fade">
      <span className="eyebrow"><Link href={`/${lg}`}>{LG[lg]}</Link></span>
      <h1>{say("align.title")}</h1>
      <p className="lede">{rows.length ? say("align.lede", { league: LG[lg] }) : say("align.ledeNone", { league: LG[lg] })}</p>
    </section>
  );
  if (!rows.length) return <><AccentStyle league={lg} />{head}</>;

  const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
  const leagueYears = summary.seasons.filter((s) => s.league === lg).map((s) => s.year).sort((a, b) => a - b);
  const asked = yearSchema.parse(sp.season);
  const selected = years.includes(asked) ? asked : years[years.length - 1];
  const here = rows.filter((r) => r.year === selected);
  const groups = season(here);
  const hereChanges = changes.filter((c) => c.year === selected);
  const movedTo = new Map<number, AlignmentChangeRow>(hereChanges.map((c) => [c.franchise_id, c]));
  const labelOf = new Map(summary.seasons.filter((s) => s.league === lg).map((s) => [s.year, s.label]));

  const lanes = lanesOf(rows, leagueYears);
  const labels = laneLabels(say, lanes);
  const arrivals = new Map<string, Map<number, string[]>>();
  for (const c of changes) {
    const key = `${c.to_conference ?? ""}|${c.to_division ?? ""}`;
    const byYear = arrivals.get(key) ?? new Map<number, string[]>();
    byYear.set(c.year, [...(byYear.get(c.year) ?? []), c.team ?? `#${c.franchise_id}`]);
    arrivals.set(key, byYear);
  }
  const timeline: TimelineLane[] = lanes.map((l, i) => ({
    key: l.key, conference: l.conference, division: l.division, label: labels[i], spans: l.spans,
    counts: [...l.counts.entries()].sort((a, b) => a[0] - b[0]),
    arrivals: [...(arrivals.get(l.key) ?? new Map<number, string[]>()).entries()].sort((a, b) => a[0] - b[0]),
  }));

  return (
    <>
      <AccentStyle league={lg} />
      {head}
      <section className="section">
        <h2>{say("align.throughYears")}</h2>
        <p className="note">{say("align.timelineNote")}</p>
        <AlignmentTimeline lg={lg} lanes={timeline} first={years[0]} last={years[years.length - 1]} selected={selected} />
        <details>
          <summary>{say("align.asTable")}</summary>
          <div className="scroll">
            <table className="history">
              <thead><tr><th scope="col">{say("col.conference")}</th><th scope="col">{say("col.division")}</th><th scope="col">{say("col.seasons")}</th></tr></thead>
              <tbody>
                {lanes.map((l) => (
                  <tr key={l.key}>
                    <td>{l.conference ?? ""}</td>
                    <td>{l.division ?? ""}</td>
                    <td className="span">{l.spans.map((s) => s.from === s.to ? seasonLabel(lg, s.from) : say("align.span", { from: seasonLabel(lg, s.from), to: seasonLabel(lg, s.to) })).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <section className="section">
        <div className="controls">
          <h2>{say("season.title", { label: labelOf.get(selected) ?? seasonLabel(lg, selected) })}</h2>
          <AlignmentSeasonSelect value={selected}
            seasons={[...years].reverse().map((y) => ({ year: y, label: labelOf.get(y) ?? seasonLabel(lg, y) }))} />
          <Link href={`/${lg}/${selected}?view=${here.some((r) => r.division) ? "division" : "conference"}`} prefetch={false}>{say("align.standingsThat")}</Link>
        </div>
        <div className="aligngrid">
          {groups.map((c) => (
            <div className="alignconf" key={c.name}>
              {c.name ? <h3>{c.name}</h3> : null}
              {c.divisions.map((d) => (
                <div className="aligndiv" key={d.name}>
                  {d.name ? <h4>{d.name}</h4> : null}
                  <ul>
                    {d.clubs.map((r) => {
                      const m = movedTo.get(r.franchise_id);
                      return (
                        <li key={r.team_id}>
                          <Link href={`/${lg}/team/${r.franchise_id}`} prefetch={false}>{r.team}</Link>
                          {m ? <span className="moved">{moveText(say, m)}</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
      <section className="section">
        <h2>{say("align.whatChanged", { label: labelOf.get(selected) ?? seasonLabel(lg, selected) })}</h2>
        {hereChanges.length ? (
          <div className="changes">
            {hereChanges.map((c) => (
              <div className="change" key={c.franchise_id}>
                <b>{c.from_year != null ? seasonLabel(lg, c.year) : ""}</b>
                <span className="what">
                  <Link href={`/${lg}/team/${c.franchise_id}`} prefetch={false}>{c.team}</Link>{" "}{moveText(say, c)}
                  {c.from_year != null && c.from_year !== c.year - 1 ? <span className="meta">{say("align.lastPlaced", { season: seasonLabel(lg, c.from_year) })}</span> : null}
                </span>
              </div>
            ))}
          </div>
        ) : <p className="note">{say("align.noChanges")}</p>}
      </section>
    </>
  );
}
