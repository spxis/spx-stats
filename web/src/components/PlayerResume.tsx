import Link from "next/link";
import { MiniCup } from "@/components/TrophyIcon";
import { TeamLabel } from "@/components/TeamLabel";
import { logoFor, type BrandMap } from "@/lib/brand";
import type { PersonResumeRow, PersonSeasonTeamRow } from "@/lib/api/player";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import { isLeague, LG, seasonLabel } from "@/lib/leagues";
import { seasonPath } from "@/lib/slug";

type Entry = { year: number | null; end: number | null; kind: "education" | "club" | "draft" | "league"; body: React.ReactNode };

/** A player's runs of seasons with one club in one league (an unbroken run of years is one line). */
function runsOf(seasons: PersonSeasonTeamRow[]) {
  const key = (s: PersonSeasonTeamRow) => `${s.league}|${s.franchise_id}`;
  const groups = new Map<string, PersonSeasonTeamRow[]>();
  for (const s of seasons) groups.set(key(s), [...(groups.get(key(s)) ?? []), s]);
  const runs: { league: string; f: number; team: string | null; from: number; to: number }[] = [];
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => a.year - b.year);
    let cur = { league: sorted[0].league, f: sorted[0].franchise_id, team: sorted[0].team, from: sorted[0].year, to: sorted[0].year };
    for (const s of sorted.slice(1)) {
      if (s.year <= cur.to + 1) { cur.to = s.year; cur.team = s.team ?? cur.team; } else { runs.push(cur); cur = { league: s.league, f: s.franchise_id, team: s.team, from: s.year, to: s.year }; }
    }
    runs.push(cur);
  }
  return runs;
}

const span = (a: number | null, b: number | null) => (a == null ? "" : b == null || b === a ? String(a) : `${a}–${b}`);

/** The sports resume: where they studied, the clubs outside our five leagues, the draft, their seasons in the leagues, playoff appearances and titles, by year. */
export async function PlayerResume({ resume, seasons, brands }: { resume: PersonResumeRow[]; seasons: PersonSeasonTeamRow[]; brands: BrandMap }) {
  const { say, fmt } = await currentSpeaker();
  const entries: Entry[] = [];
  for (const r of resume) {
    const lvl = r.level ? say(`resume.level.${r.level}` as PhraseKey) : null;
    if (r.kind === "education") entries.push({ year: r.start_year, end: r.end_year, kind: "education", body: <><b>{r.name}</b>{lvl ? <span className="rmeta"> · {lvl}</span> : null}</> });
    else if (r.kind === "draft") entries.push({ year: r.start_year, end: null, kind: "draft", body: <>{say("resume.draftedBy", { team: r.name })}{r.detail ? <span className="rmeta"> · {r.detail}</span> : null}</> });
    else entries.push({ year: r.start_year, end: r.end_year, kind: "club", body: <><b>{r.name}</b><span className="rmeta">{[r.league, lvl].filter(Boolean).length ? " · " + [r.league, lvl].filter(Boolean).join(" · ") : ""}</span></> });
  }
  for (const u of runsOf(seasons)) {
    const lg = isLeague(u.league) ? LG[u.league] : u.league;
    entries.push({ year: u.from, end: u.to, kind: "league", body: <><TeamLabel lg={u.league} f={u.f} name={u.team} logo={logoFor(brands, u.f, u.to)} />
      <span className="rmeta"> · {lg} · {u.to === u.from ? seasonLabel(u.league, u.from) : `${seasonLabel(u.league, u.from)} – ${seasonLabel(u.league, u.to)}`}</span></> });
  }
  entries.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || (a.end ?? 9999) - (b.end ?? 9999));

  const playoffYears = new Map<string, PersonSeasonTeamRow>();
  const titleYears = new Map<string, PersonSeasonTeamRow>();
  for (const s of seasons) {
    const k = `${s.league}|${s.year}`;
    if (s.played_playoffs || s.team_made_playoffs) playoffYears.set(k, s);
    if (s.team_champion) titleYears.set(k, s);
  }
  const chips = (m: Map<string, PersonSeasonTeamRow>) => [...m.values()].sort((a, b) => b.year - a.year);
  if (!entries.length && !playoffYears.size) return null;
  return (
    <section className="section">
      <h2>{say("resume.title")}</h2>
      {entries.length ? (
        <ol className="rtimeline">
          {entries.map((e, i) => (
            <li key={i}>
              <span className="ryear">{span(e.year, e.end) || "–"}</span>
              <span className={`rkind rk-${e.kind}`}>{say(`resume.kind.${e.kind}` as PhraseKey)}</span>
              <span className="rbody">{e.body}</span>
            </li>
          ))}
        </ol>
      ) : null}
      <dl className="pfacts">
        <div className="pfact"><dt>{say("resume.playoffs")}</dt><dd>{fmt(playoffYears.size)}</dd></div>
        <div className="pfact"><dt>{say("resume.titles")}</dt><dd>{fmt(titleYears.size)}{[...titleYears.values()].slice(0, titleYears.size > 5 ? 1 : 5).map((s, i) => <MiniCup key={i} league={s.league} />)}</dd></div>
      </dl>
      {playoffYears.size ? (
        <div className="seasonlist" aria-label={say("resume.playoffs")}>
          {chips(playoffYears).map((s) => (
            <Link key={`${s.league}${s.year}`} href={seasonPath(s.league, s.year)} prefetch={false} className={titleYears.has(`${s.league}|${s.year}`) ? "full" : undefined}>
              {`${isLeague(s.league) ? LG[s.league] : s.league} ${s.season_label}`}
            </Link>
          ))}
        </div>
      ) : null}
      {playoffYears.size ? <p className="note">{say("resume.playoffsNote")}</p> : null}
    </section>
  );
}
