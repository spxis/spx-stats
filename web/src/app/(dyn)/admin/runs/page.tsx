import { DbChip } from "@/components/admin/DbChip";
import type { Metadata } from "next";
import Link from "next/link";
import { GreyMarker } from "@/components/GreyMarker";
import { LocalTime } from "@/components/LocalTime";
import { greySourcesIn } from "@/lib/adminSources";
import { requireAdmin } from "@/lib/auth/user";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { Speaker } from "@/lib/i18n/i18n";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import { jobNames, listRuns, runsSince, type Run } from "@/lib/runlog/client";
import { tursoConfigured } from "@/lib/turso/client";
import { countsLine, dayOf, durationSeconds, EXPECTED, expectedLines, filterQuery, KINDS, OUTCOMES, PAGE_SIZE, parseFilters, parseJson, tone, type Filters } from "@/lib/runlog/rules";

/**
 * The run log for admins: a daily "did it run?" view (each job that should run by itself, MISSED when it did not) and a timeline of everything
 * automated plus the human decisions around it (approvals, deployments, DS1 steps), filtered by kind, job, outcome and date. Each row opens its
 * detail. Read from Turso (lib/runlog), drawn per request, admin only. Times are shown in the reader's zone (LocalTime).
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const metadata: Metadata = { title: "Run log", robots: { index: false, follow: false } };

type Query = Record<string, string | string[] | undefined>;
const say = (s: Speaker, key: string, vars?: Record<string, string | number>) => s.say(key as PhraseKey, vars);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function Badge({ s, outcome }: { s: Speaker; outcome: string }) {
  return <span className={`tk-badge run-${tone(outcome)}`}>{say(s, `runs.outcome.${outcome}`) === `runs.outcome.${outcome}` ? outcome : say(s, `runs.outcome.${outcome}`)}</span>;
}

function Daily({ s, day, lines }: { s: Speaker; day: string; lines: ReturnType<typeof expectedLines> }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <section className="section ops-section" aria-labelledby="runs-daily">
      <h2 id="runs-daily">{s.say("runs.daily.title")}</h2>
      <p className="note">{s.say("runs.daily.lede")}</p>
      <p className="ops-top">
        <Link href={`/admin/runs?day=${addDays(day, -1)}`}>{s.say("runs.daily.prev")}</Link>
        <strong>{s.say("runs.daily.day", { day })}</strong>
        {day < today ? <Link href={`/admin/runs?day=${addDays(day, 1)}`}>{s.say("runs.daily.next")}</Link> : null}
        {day !== today ? <Link href="/admin/runs">{s.say("runs.daily.today")}</Link> : null}
      </p>
      <table className="runs-table">
        <thead>
          <tr>
            <th>{s.say("runs.daily.col.job")}</th><th>{s.say("runs.daily.col.state")}</th><th>{s.say("runs.daily.col.runs")}</th><th>{s.say("runs.daily.col.last")}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const e = EXPECTED.find((x) => x.job === l.job);
            const rule = e ? (e.cadence === "daily" ? s.say("runs.expect.daily", { time: e.dueUtc }) : s.say("runs.expect.every", { hours: e.hours })) : "";
            return (
              <tr key={l.job} className={l.state === "missed" || l.state === "failed" ? "ops-diff" : undefined}>
                <td><Link href={`/admin/runs${filterQuery({ job: l.job })}`}>{l.label}</Link><br /><span className="note">{rule}</span></td>
                <td><span className={`tk-badge run-${l.state === "missed" || l.state === "failed" ? "bad" : l.state === "warning" ? "warn" : l.state === "ran" ? "ok" : "idle"}`}>{say(s, `runs.state.${l.state}`)}</span></td>
                <td>{l.count}</td>
                <td>
                  {l.last ? <><Link href={`/admin/runs/${l.last.uid}`}><LocalTime iso={l.last.started_at} /></Link>{l.last.summary ? <span className="note"> · {l.last.summary}</span> : null}</> : <span className="note">–</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Filter({ s, f, jobs }: { s: Speaker; f: Filters; jobs: string[] }) {
  const allJobs = Array.from(new Set([...jobs, ...(f.job ? [f.job] : [])])).sort();
  return (
    <form method="get" action="/admin/runs" className="tk-filters runs-filters">
      <label>{s.say("runs.filter.kind")}{" "}
        <select name="kind" defaultValue={f.kind}>
          <option value="">{s.say("runs.filter.any")}</option>
          {KINDS.map((k) => <option key={k} value={k}>{say(s, `runs.kind.${k}`)}</option>)}
        </select>
      </label>
      <label>{s.say("runs.filter.job")}{" "}
        <select name="job" defaultValue={f.job}>
          <option value="">{s.say("runs.filter.any")}</option>
          {allJobs.map((j) => <option key={j} value={j}>{j}</option>)}
        </select>
      </label>
      <label>{s.say("runs.filter.outcome")}{" "}
        <select name="outcome" defaultValue={f.outcome}>
          <option value="">{s.say("runs.filter.any")}</option>
          {OUTCOMES.map((o) => <option key={o} value={o}>{say(s, `runs.outcome.${o}`)}</option>)}
        </select>
      </label>
      <label>{s.say("runs.filter.from")}{" "}<input type="date" name="from" defaultValue={f.from} /></label>
      <label>{s.say("runs.filter.to")}{" "}<input type="date" name="to" defaultValue={f.to} /></label>
      <button type="submit" className="signin-btn">{s.say("runs.filter.apply")}</button>
      <Link href="/admin/runs">{s.say("runs.filter.reset")}</Link>
    </form>
  );
}

function Timeline({ s, rows }: { s: Speaker; rows: Run[] }) {
  return (
    <div className="runs-wrap">
      <table className="runs-table">
        <thead>
          <tr>
            <th>{s.say("runs.col.started")}</th><th>{s.say("runs.col.kind")}</th><th>{s.say("runs.col.job")}</th><th>{s.say("runs.col.outcome")}</th>
            <th>{s.say("runs.col.summary")}</th><th>{s.say("runs.col.duration")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const secs = durationSeconds(r.started_at, r.finished_at);
            const counts = countsLine(parseJson(r.counts));
            return (
              <tr key={r.uid}>
                <td><Link href={`/admin/runs/${r.uid}`}><LocalTime iso={r.started_at} /></Link></td>
                <td>{say(s, `runs.kind.${r.kind}`) === `runs.kind.${r.kind}` ? r.kind : say(s, `runs.kind.${r.kind}`)}</td>
                <td>{r.job}{r.scope ? <span className="note"> · {r.scope}</span> : null}{greySourcesIn([r.job, r.scope]).length ? <> <GreyMarker s={s} /></> : null}</td>
                <td><Badge s={s} outcome={r.outcome} /></td>
                <td>{r.summary ?? ""}{counts ? <><br /><span className="note">{counts}</span></> : null}</td>
                <td>{secs === null ? <span className="note">–</span> : s.say("runs.seconds", { n: secs })}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function RunsPage({ searchParams }: { searchParams: Promise<Query> }) {
  await requireAdmin();
  const q = await searchParams;
  const s = await currentSpeaker();
  const f = parseFilters(q);
  const day = dayOf(q.day);

  let rows: Run[] = [];
  let more = false;
  let jobs: string[] = [];
  let lines: ReturnType<typeof expectedLines> | null = null;
  let problem = "";
  if (!tursoConfigured()) {
    problem = "config";
  } else {
    try {
      const nextDay = addDays(day, 1);
      // the days that count for "ran today" start a day before, so an `every` job can look three hours back across midnight
      const [list, names, dayRuns] = await Promise.all([
        listRuns(f),
        jobNames(),
        runsSince(`${addDays(day, -1)}T00:00:00Z`, `${nextDay}T00:00:00Z`),
      ]);
      rows = list.rows;
      more = list.more;
      jobs = names;
      lines = expectedLines(dayRuns, day);
    } catch (e) {
      problem = e instanceof Error ? e.message : "error";
    }
  }
  const filtered = Boolean(f.kind || f.job || f.outcome || f.from || f.to);
  const page = (p: number) => `/admin/runs${filterQuery({ ...f, page: p })}`;
  return (
    <>
      <section className="head fade">
        <h1>{s.say("runs.title")} <DbChip db="turso" /></h1>
        <p className="lede">{s.say("runs.lede")}</p>
        {problem === "config" ? <p className="note" role="alert">{s.say("runs.notConfigured")}</p> : null}
        {problem && problem !== "config" ? <p className="note" role="alert">{s.say("runs.unavailable", { reason: problem.slice(0, 160) })}</p> : null}
      </section>
      {lines ? <Daily s={s} day={day} lines={lines} /> : null}
      {!problem ? (
        <section className="section" aria-labelledby="runs-timeline">
          <h2 id="runs-timeline">{s.say("runs.timeline.title")}</h2>
          <Filter s={s} f={f} jobs={jobs} />
          {rows.length ? <Timeline s={s} rows={rows} /> : <p className="note">{filtered ? s.say("runs.noMatch") : s.say("runs.empty")}</p>}
          {f.page > 1 || more ? (
            <p className="ops-top">
              {f.page > 1 ? <Link href={page(f.page - 1)}>{s.say("runs.page.newer")}</Link> : null}
              <span className="note">{s.say("runs.page.n", { page: f.page })} ({PAGE_SIZE})</span>
              {more ? <Link href={page(f.page + 1)}>{s.say("runs.page.older")}</Link> : null}
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
