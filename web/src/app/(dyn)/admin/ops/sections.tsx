import Link from "next/link";
import { SortTable } from "@/components/SortTable";
import type { PluralBase, Speaker } from "@/lib/i18n/i18n";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import { age, clock, exportVerdict, harvesterTone, minutesBetween, pauseControl, queuedOf, series, syncRows } from "@/lib/ops/rules";
import { isFailed, type Backup, type Daily, type Failed, type HistoryPoint, type OpsRequest, type Releases, type Sync, type Watchdog, type Harvester } from "@/lib/ops/schema";
import { bytesLabel } from "@/lib/releases/rules";
import { parseSort, type SortColumn } from "@/lib/sort";
import { RequestButton } from "../data/RequestButton";
import { OpsButton } from "./OpsButton";
import { Spark } from "./Spark";

type Query = Record<string, string | string[] | undefined>;
type Section<T> = T | Failed;

const dash = <span className="note">–</span>;
const phrase = (s: Speaker, key: string, vars?: Record<string, string | number>) => s.say(key as PhraseKey, vars);
const keysOf = (c: SortColumn[]) => c.map((x) => x.key);
const time = (iso: string | null | undefined) => clock(iso) ?? "?";

/** "5 minutes", "3 hours", "2 days". */
export function agoText(s: Speaker, minutes: number | null): string {
  if (minutes === null) return "?";
  const a = age(minutes);
  return s.plural(`ops.ago.${a.unit}` as PluralBase, a.n);
}

/** The time a moment happened and how long before the snapshot (`at`) it was, for lines that read "X UTC, N minutes before the snapshot". */
const before = (s: Speaker, iso: string | null | undefined, at: string) => agoText(s, minutesBetween(iso, at));

function Heading({ s, id, title, children }: { s: Speaker; id: string; title: PhraseKey; children?: React.ReactNode }) {
  return (
    <section className="section ops-section" aria-labelledby={id}>
      <h2 id={id}>{s.say(title)}</h2>
      {children}
    </section>
  );
}

function Unreadable({ s, section }: { s: Speaker; section: Failed }) {
  return <p className="dr-alert" role="alert">{s.say("ops.sectionError", { error: section.error })}</p>;
}

// ---------------------------------------------------------------------------------------------------- harvester

export function HarvesterSection({ s, h, at, history, requests, query }: { s: Speaker; h: Section<Harvester>; at: string; history: HistoryPoint[]; requests: OpsRequest[]; query: Query }) {
  if (isFailed(h)) return <Heading s={s} id="ops-harvester" title="ops.harvester.title"><Unreadable s={s} section={h} /></Heading>;
  const control = pauseControl(h, requests);
  const queueCols: SortColumn[] = [
    { key: "kind", label: s.say("ops.col.kind") },
    ...(["queued", "running", "done", "failed", "gone"] as const).map((k) => ({ key: k, label: phrase(s, `ops.col.${k}`), num: true })),
  ];
  const gapCols: SortColumn[] = [
    { key: "kind", label: s.say("ops.col.kind") },
    { key: "league", label: s.say("ops.col.league") },
    { key: "left", label: s.say("ops.col.left"), num: true },
  ];
  const kinds = Object.keys(h.queue).sort();
  const pages = series(history, "pages");
  const gaps = series(history, "gaps");
  const lastPages = pages.length ? pages[pages.length - 1] : null;
  const lastGaps = gaps.length ? gaps[gaps.length - 1] : null;
  return (
    <Heading s={s} id="ops-harvester" title="ops.harvester.title">
      <p className="note">{s.say("ops.harvester.intro")}</p>
      <p><span className={`tk-badge ${harvesterTone(h.state)}`}>{phrase(s, `ops.state.${h.state}`)}</span></p>
      {h.paused ? <p className="note">{s.say("ops.harvester.pausedBy", { who: h.paused.by ?? "?", time: clock(h.paused.at) ?? "?" })}</p> : null}
      <ul className="ops-facts">
        {h.last_beat_at ? <li>{s.say("ops.harvester.heartbeat", { time: time(h.last_beat_at), ago: before(s, h.last_beat_at, at) })}</li> : null}
        {h.run ? <li>{s.say("ops.harvester.run", { id: h.run.id ?? "?", time: time(h.run.started_at), sha: h.run.sha ?? "?" })}</li> : null}
        <li>{s.say("ops.harvester.hour", { requests: s.fmt(h.hour.requests), pages: s.fmt(h.hour.archived), size: bytesLabel(h.hour.bytes) })}</li>
        <li>{s.say("ops.harvester.today", { requests: s.fmt(h.today.requests), pages: s.fmt(h.today.archived), size: bytesLabel(h.today.bytes) })}</li>
        <li>{s.say("ops.harvester.archive", { n: s.fmt(h.archive_rows) })}</li>
        <li>
          {h.last_error
            ? s.say("ops.harvester.lastError", { kind: h.last_error.kind ?? "?", target: h.last_error.target ?? "?", time: time(h.last_error.at), error: h.last_error.error ?? "?" })
            : s.say("ops.harvester.noError")}
        </li>
      </ul>
      <div className="ops-sparks">
        <Spark values={pages} caption={s.say("ops.harvester.sparkPages")} empty={s.say("ops.none")} last={lastPages === null ? "–" : s.fmt(lastPages)} />
        <Spark values={gaps} caption={s.say("ops.harvester.sparkGaps")} empty={s.say("ops.none")} last={lastGaps === null ? "–" : s.fmt(lastGaps)} />
      </div>
      <OpsButton kind={control.show === "pause" ? "harvest_pause" : "harvest_resume"} waiting={queuedOf(requests, control.show === "pause" ? "harvest_pause" : "harvest_resume") !== null} />

      <h3>{s.say("ops.harvester.queueTitle")}</h3>
      {kinds.length === 0 ? <p className="note">{s.say("ops.harvester.queueNone")}</p> : (
        <div className="scroll">
          <SortTable
            columns={queueCols} param="sort_queue" def="kind.asc" initial={parseSort(query.sort_queue, keysOf(queueCols), "kind.asc")} label={s.say("ops.harvester.queueTitle")}
            rows={kinds.map((k) => ({
              id: k,
              sort: { kind: k, queued: h.queue[k]?.queued ?? 0, running: h.queue[k]?.running ?? 0, done: h.queue[k]?.done ?? 0, failed: h.queue[k]?.failed ?? 0, gone: h.queue[k]?.gone ?? 0 },
              cells: { kind: <code>{k}</code>, queued: s.fmt(h.queue[k]?.queued ?? 0), running: s.fmt(h.queue[k]?.running ?? 0), done: s.fmt(h.queue[k]?.done ?? 0), failed: s.fmt(h.queue[k]?.failed ?? 0), gone: s.fmt(h.queue[k]?.gone ?? 0) },
            }))}
          />
        </div>
      )}

      <h3>{s.say("ops.harvester.gapTitle")}</h3>
      {h.gap.length === 0 ? <p className="note">{s.say("ops.harvester.gapNone")}</p> : (
        <>
          <p className="note">{s.say("ops.harvester.gapTotal", { n: s.fmt(h.gap_total) })}</p>
          <div className="scroll">
            <SortTable
              columns={gapCols} param="sort_gap" def="left.desc" initial={parseSort(query.sort_gap, keysOf(gapCols), "left.desc")} label={s.say("ops.harvester.gapTitle")}
              rows={h.gap.map(([kind, league, left]) => ({
                id: `${kind}:${league}`,
                sort: { kind, league, left },
                cells: { kind: <code>{kind}</code>, league: league === "-" ? dash : league.toUpperCase(), left: s.fmt(left) },
              }))}
            />
          </div>
        </>
      )}
    </Heading>
  );
}

// ---------------------------------------------------------------------------------------------------- backups

export function BackupSection({ s, b, at }: { s: Speaker; b: Section<Backup>; at: string }) {
  if (isFailed(b)) return <Heading s={s} id="ops-backup" title="ops.backup.title"><Unreadable s={s} section={b} /></Heading>;
  const e = b.export;
  const verdict = exportVerdict(b, at);
  const tone = verdict === "ok" ? "done" : verdict === "unknown" ? "" : verdict === "never" || verdict === "stale" ? "live" : "stale";
  return (
    <Heading s={s} id="ops-backup" title="ops.backup.title">
      <p className="note">{s.say("ops.backup.intro")}</p>
      <p><span className={`tk-badge ${tone}`}>{phrase(s, `ops.verdict.${verdict}`)}</span></p>
      <ul className="ops-facts">
        <li>{s.say("ops.backup.archive", { rows: s.fmt(b.archive_rows), size: bytesLabel(b.archive_bytes) })}</li>
        {e === null ? <li>{s.say("ops.backup.never")}</li> : isFailed(e) ? <li>{s.say("ops.backup.missing")}</li> : (
          <li>
            {s.say("ops.backup.last", {
              time: time(e.at), ago: before(s, e.at, at), checked: s.fmt(e.checked), copied: s.fmt(e.copied), present: s.fmt(e.present), failed: s.fmt(e.failed),
              size: bytesLabel(e.bytes), seconds: e.seconds ?? "?",
            })}
          </li>
        )}
        {b.last_ok_at && e !== null && !isFailed(e) && e.failed > 0 ? <li>{s.say("ops.backup.lastOk", { time: time(b.last_ok_at) })}</li> : null}
      </ul>
      {e === null || verdict === "stale" ? <p className="note">{s.say("ops.backup.schedule")}</p> : null}
    </Heading>
  );
}

// ---------------------------------------------------------------------------------------------------- DS1 versus production

export function SyncSection({ s, y, at, query }: { s: Speaker; y: Section<Sync>; at: string; query: Query }) {
  if (isFailed(y)) return <Heading s={s} id="ops-sync" title="ops.sync.title"><Unreadable s={s} section={y} /></Heading>;
  const rows = syncRows(y);
  const cols: SortColumn[] = [
    { key: "table", label: s.say("ops.col.table") },
    { key: "ds1", label: s.say("ops.col.ds1"), num: true },
    { key: "prod", label: s.say("ops.col.prod"), num: true },
    { key: "diff", label: s.say("ops.col.diff"), num: true },
    { key: "state", label: s.say("ops.col.state") },
  ];
  const signed = (n: number | null) => (n === null ? "–" : `${n > 0 ? "+" : ""}${s.fmt(n)}`);
  return (
    <Heading s={s} id="ops-sync" title="ops.sync.title">
      <p className="note">{s.say("ops.sync.intro")}</p>
      {y.checked_at === null ? <p className="dr-alert" role="alert">{s.say("ops.sync.never")}</p> : (
        <p className={y.differs > 0 ? "dr-alert" : "note"} role={y.differs > 0 ? "alert" : "status"}>
          {s.say("ops.sync.checked", { time: time(y.checked_at), ago: before(s, y.checked_at, at), differs: y.differs, count: y.count })}
          {y.differs === 0 ? ` ${s.say("ops.sync.allSame")}` : ""}
        </p>
      )}
      <p className="note">{s.say("ops.sync.checkNote")}</p>
      <RequestButton kind="drift" blocked={null} />
      {y.trimmed ? <p className="note">{s.say("ops.sync.trimmed")}</p> : null}
      {rows.length > 0 ? (
        <div className="scroll">
          <SortTable
            columns={cols} param="sort_sync" def="state.asc" initial={parseSort(query.sort_sync, keysOf(cols), "state.asc")} label={s.say("ops.sync.title")}
            rows={rows.map((r) => ({
              id: r.table,
              className: r.differs ? "ops-diff" : undefined,
              sort: { table: r.table, ds1: r.ds1, prod: r.prod, diff: r.delta === null ? null : Math.abs(r.delta), state: r.differs ? 0 : 1 },
              cells: {
                table: <code>{r.table}</code>, ds1: r.ds1 === null ? dash : s.fmt(r.ds1), prod: r.prod === null ? dash : s.fmt(r.prod), diff: r.differs ? signed(r.delta) : dash,
                state: <span className={`tk-badge ${r.differs ? "stale" : "done"}`}>{s.say(r.differs ? "ops.sync.differs" : "ops.sync.same")}</span>,
              },
            }))}
          />
        </div>
      ) : null}
    </Heading>
  );
}

// ---------------------------------------------------------------------------------------------------- daily job

export function DailySection({ s, d, at }: { s: Speaker; d: Section<Daily>; at: string }) {
  if (isFailed(d)) return <Heading s={s} id="ops-daily" title="ops.daily.title"><Unreadable s={s} section={d} /></Heading>;
  const counts = d.last ? Object.entries(d.last.counts).map(([k, v]) => `${k} ${s.fmt(v)}`).join(", ") : "";
  return (
    <Heading s={s} id="ops-daily" title="ops.daily.title">
      {d.last === null ? <p className="note">{s.say("ops.daily.never")}</p> : (
        <ul className="ops-facts">
          <li>
            {s.say("ops.daily.last", { time: time(d.last.started_at), ago: before(s, d.last.started_at, at), outcome: phrase(s, `ops.outcome.${d.last.outcome ?? "running"}`) })}
          </li>
          <li>{s.say("ops.daily.week", { ok: d.ok_7d, failed: d.failed_7d })}</li>
          {counts ? <li>{s.say("ops.daily.counts", { counts })}</li> : null}
        </ul>
      )}
      <p className="note">
        {d.release ? s.say("ops.daily.release", { number: d.release.number ?? "?", status: d.release.status ?? "?", time: time(d.release.at) }) : s.say("ops.daily.noRelease")}
      </p>
    </Heading>
  );
}

// ---------------------------------------------------------------------------------------------------- watchdog

export function WatchdogSection({ s, w, at }: { s: Speaker; w: Section<Watchdog>; at: string }) {
  if (isFailed(w)) return <Heading s={s} id="ops-watchdog" title="ops.watchdog.title"><Unreadable s={s} section={w} /></Heading>;
  const notYet = s.say("ops.notYet");
  return (
    <Heading s={s} id="ops-watchdog" title="ops.watchdog.title">
      <p className="note">{s.say("ops.watchdog.intro")}</p>
      {!w.enabled ? <p className="note">{s.say("ops.watchdog.off")}</p> : null}
      {w.enabled && !w.known ? <p className="note">{s.say("ops.watchdog.unknown")}</p> : null}
      {w.known ? (
        <ul className="ops-facts">
          <li>{s.say("ops.watchdog.probe", { time: time(w.last_probe_at), ago: before(s, w.last_probe_at, at), result: s.say(w.last_probe_ok ? "ops.watchdog.up" : "ops.watchdog.down") })}</li>
          {w.last_ok_at && !w.last_probe_ok ? <li>{s.say("ops.watchdog.okAt", { time: time(w.last_ok_at) })}</li> : null}
        </ul>
      ) : null}
      {w.open ? (
        <p className="dr-alert" role="alert">
          {s.say("ops.watchdog.open", { since: time(w.open.since), probes: w.open.probes_failed, reload: w.open.reload_at ? time(w.open.reload_at) : notYet, restart: w.open.restart_at ? time(w.open.restart_at) : notYet })}
        </p>
      ) : w.last_incident ? (
        <p className="note">{s.say("ops.watchdog.last", { since: time(w.last_incident.since), recovered: w.last_incident.recovered_at ? time(w.last_incident.recovered_at) : notYet })}</p>
      ) : <p className="note">{s.say("ops.watchdog.noIncident")}</p>}
    </Heading>
  );
}

// ---------------------------------------------------------------------------------------------------- releases

export function ReleasesSection({ s, r }: { s: Speaker; r: Section<Releases> }) {
  if (isFailed(r)) return <Heading s={s} id="ops-releases" title="ops.releases.title"><Unreadable s={s} section={r} /></Heading>;
  return (
    <Heading s={s} id="ops-releases" title="ops.releases.title">
      <ul className="ops-facts">
        <li>{s.say("ops.releases.counts", { pending: r.pending, approved: r.approved, running: r.running })}</li>
        <li>{r.last_done ? s.say("ops.releases.lastDone", { number: r.last_done.number ?? "?", title: r.last_done.title ?? "", time: time(r.last_done.at) }) : s.say("ops.releases.noneDone")}</li>
        {r.last_failed ? <li>{s.say("ops.releases.lastFailed", { number: r.last_failed.number ?? "?", title: r.last_failed.title ?? "", time: time(r.last_failed.at) })}</li> : null}
        <li>{s.say("ops.releases.runner", { sha: r.runner.sha ?? "?", ref: r.runner.ref ?? "?" })}</li>
        <li>{s.say("ops.releases.drift", { time: r.drift_checked_at ? time(r.drift_checked_at) : "?", day: r.nightly_drift_day ?? "?" })}</li>
      </ul>
      <p><Link href="/admin/data">{s.say("ops.links.releases")}</Link></p>
    </Heading>
  );
}

// ---------------------------------------------------------------------------------------------------- requests

export function RequestsSection({ s, requests, query }: { s: Speaker; requests: OpsRequest[]; query: Query }) {
  const cols: SortColumn[] = [
    { key: "id", label: s.say("ops.col.id"), num: true },
    { key: "what", label: s.say("ops.col.what") },
    { key: "who", label: s.say("ops.col.who") },
    { key: "asked", label: s.say("ops.col.asked"), cls: "nowrap" },
    { key: "status", label: s.say("ops.col.state") },
    { key: "result", label: s.say("ops.col.result") },
  ];
  return (
    <Heading s={s} id="ops-requests" title="ops.requests.title">
      {requests.length === 0 ? <p className="note">{s.say("ops.requests.none")}</p> : (
        <div className="scroll">
          <SortTable
            columns={cols} param="sort_req" def="id.desc" initial={parseSort(query.sort_req, keysOf(cols), "id.desc")} label={s.say("ops.requests.title")}
            rows={requests.map((r) => ({
              id: String(r.id),
              sort: { id: r.id, what: r.kind, who: r.requested_by, asked: r.requested_at, status: r.status, result: r.summary },
              cells: {
                id: r.id,
                what: phrase(s, `ops.kind.${r.kind}`),
                who: r.requested_by,
                asked: <time dateTime={r.requested_at}>{r.requested_at.slice(0, 16).replace("T", " ")}</time>,
                status: <span className={`tk-badge ${r.status === "done" ? "done" : r.status === "failed" ? "stale" : "live"}`}>{phrase(s, `ops.status.${r.status}`)}</span>,
                result: r.summary ?? dash,
              },
            }))}
          />
        </div>
      )}
    </Heading>
  );
}
