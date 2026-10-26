import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConfirmSummary } from "@/components/ConfirmSummary";
import { LocalTime, Stamped } from "@/components/LocalTime";
import { SortTable } from "@/components/SortTable";
import { requireAdmin } from "@/lib/auth/user";
import { describeRow } from "@/lib/liveRequest";
import { ReleaseError, apiHealth, releaseDashboard, type Dashboard, type Release, type ScoreRequest } from "@/lib/releases/client";
import { TAB_COOKIE, autoApproveAt, bytesLabel, driftState, healthLine, isAutoApproved, matchesAutoFilter, parseTab, requestBlock, type Tab } from "@/lib/releases/rules";
import { parseSort, type SortColumn, type SortRow } from "@/lib/sort";
import { AutoSwitch } from "./AutoSwitch";
import { DecisionCard } from "./DecisionCard";
import { RequestButton } from "./RequestButton";
import { TabMemory } from "./TabMemory";

/**
 * Data releases for admins: what is waiting for approval, what ran, whether DS1 and production agree, how much space
 * production uses, and the settings (the auto-approval switch and scores update requests). Four tabs (drawn by the admin shell, app/(dyn)/admin/AdminTabs.tsx), chosen with ?tab= and
 * remembered per viewer. Admin is checked on the server for every request and anyone else gets a 404. Never cached. English only.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const metadata: Metadata = { title: "Data releases", robots: { index: false, follow: false } };

type Query = Record<string, string | string[] | undefined>;

const dash = <span className="note">–</span>;
/** A time in the reader's own zone and language (the server draws UTC, the browser swaps it; the tooltip holds the UTC value). */
const when = (iso: string | null | undefined) => (iso && !Number.isNaN(Date.parse(iso)) ? <LocalTime iso={iso} /> : dash);
const tone = (status: string) => (status === "done" ? "done" : status === "failed" ? "stale" : status === "running" || status === "approved" || status === "queued" ? "live" : "");

const PREVIEW_COLUMNS: SortColumn[] = [
  { key: "table", label: "Table" },
  { key: "add", label: "Add", num: true },
  { key: "change", label: "Change", num: true },
  { key: "remove", label: "Remove", num: true },
  { key: "size", label: "Size change", num: true },
  { key: "rows", label: "Rows now", num: true },
];
const STEP_COLUMNS: SortColumn[] = [
  { key: "table", label: "Table" },
  { key: "before", label: "Rows before", num: true },
  { key: "after", label: "Rows after", num: true },
];
const RECENT_COLUMNS: SortColumn[] = [
  { key: "number", label: "Release", cls: "nowrap" },
  { key: "title", label: "What" },
  { key: "status", label: "Status" },
  { key: "who", label: "Who" },
  { key: "when", label: "When", cls: "nowrap" },
  { key: "add", label: "Added", num: true },
  { key: "change", label: "Changed", num: true },
  { key: "remove", label: "Removed", num: true },
  { key: "ticket", label: "Ticket" },
];
const SYNC_COLUMNS: SortColumn[] = [
  { key: "table", label: "Table" },
  { key: "state", label: "State" },
  { key: "ds1", label: "DS1 rows", num: true },
  { key: "prod", label: "Production rows", num: true },
  { key: "checked", label: "Checked", cls: "nowrap" },
  { key: "detail", label: "Detail" },
];
const SPACE_COLUMNS: SortColumn[] = [
  { key: "table", label: "Table" },
  { key: "size", label: "Size", num: true },
];
const REQUEST_COLUMNS: SortColumn[] = [
  { key: "id", label: "#", num: true },
  { key: "what", label: "What" },
  { key: "who", label: "Asked by" },
  { key: "asked", label: "Asked", cls: "nowrap" },
  { key: "status", label: "Status" },
  { key: "summary", label: "What happened" },
  { key: "release", label: "Release", cls: "nowrap" },
];

type Show = "collapsed" | "all" | "auto" | "manual";
const SHOWS: { key: Show; label: string }[] = [
  { key: "collapsed", label: "manual, auto collapsed" },
  { key: "all", label: "all" },
  { key: "auto", label: "auto only" },
  { key: "manual", label: "manual only" },
];

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const parseShow = (v: string | string[] | undefined): Show => {
  const x = first(v);
  return x === "all" || x === "auto" || x === "manual" ? x : "collapsed";
};

const keys = (c: SortColumn[]) => c.map((x) => x.key);
const num = (n: number | null | undefined) => (n == null ? dash : n.toLocaleString("en-US"));

function previewRows(r: Release): { columns: SortColumn[]; rows: SortRow[] } {
  const pv = r.preview;
  if (r.kind === "ds1_step" && pv) {
    const names = Object.keys(pv.after ?? {});
    return {
      columns: STEP_COLUMNS,
      rows: names.map((n) => ({
        id: n,
        sort: { table: n, before: pv.before?.[n] ?? null, after: pv.after?.[n] ?? null },
        cells: { table: <code>{n}</code>, before: num(pv.before?.[n]), after: num(pv.after?.[n]) },
      })),
    };
  }
  return {
    columns: PREVIEW_COLUMNS,
    rows: Object.entries(pv?.tables ?? {}).map(([n, t]) => ({
      id: n,
      sort: { table: n, add: t.add, change: t.change, remove: t.remove, size: t.bytes_delta, rows: t.prod_rows },
      cells: {
        table: <code>{n}</code>, add: num(t.add), change: num(t.change), remove: num(t.remove),
        size: bytesLabel(t.bytes_delta), rows: num(t.prod_rows),
      },
    })),
  };
}

const kindLabel = (kind: string) => (kind === "ds1_step" ? "DS1 step" : kind === "daily_scores" ? "daily scores" : kind);

function AutoNote({ r, paused }: { r: Release; paused: boolean }) {
  const a = r.preview?.auto;
  if (r.kind !== "daily_scores" || !a) return null;
  if (r.held_at) return <p className="note">Held by {r.held_by} at {when(r.held_at)}. It will not be approved automatically.</p>;
  if (a.eligible) {
    return (
      <p className="note">
        Meets the auto-approval policy ({a.games ?? 0} games).{" "}
        {paused ? "Auto-approvals are paused, so it waits for you." : <>It approves itself after {when(autoApproveAt(r.created_at, a.hold_minutes))} unless you hold it.</>}
      </p>
    );
  }
  return (
    <>
      <p className="note"><strong>Not auto-approved</strong>, so it waits for you:</p>
      <ul className="note">{a.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
    </>
  );
}

/** The tables an approval changes, for the confirmation dialog. */
function approvalSummary(r: Release) {
  const pv = r.preview;
  if (r.kind === "ds1_step" && pv) {
    const rows = Object.keys(pv.after ?? {}).map((n) => ({ table: n, before: pv.before?.[n] ?? null, after: pv.after?.[n] ?? null }));
    return <ConfirmSummary rows={rows} step file={pv.file ?? undefined} />;
  }
  const entries = Object.entries(pv?.tables ?? {});
  const rows = entries.map(([n, x]) => ({ table: n, add: x.add, change: x.change, remove: x.remove }));
  const bytes = entries.reduce((sum, [, x]) => sum + x.bytes_delta, 0);
  return <ConfirmSummary rows={rows} size={rows.length ? bytesLabel(bytes) : undefined} />;
}

function PendingCard({ r, query, paused }: { r: Release; query: Query; paused: boolean }) {
  const blockers = r.preview?.blockers ?? [];
  const warnings = r.preview?.warnings ?? [];
  const { columns, rows } = previewRows(r);
  const param = `sort_r${r.id}`;
  return (
    <DecisionCard id={r.id} number={r.number} title={r.title} kind={r.kind} summary={approvalSummary(r)} approveLabel={r.kind === "ds1_step" ? "Approve and run on DS1" : "Approve and publish"} blocked={blockers.length > 0}
      holdable={r.kind === "daily_scores" && r.preview?.auto?.eligible === true && !r.held_at && !paused}>
      <div>
        <strong>{r.title}</strong>{" "}
        <span className="tk-badge">{kindLabel(r.kind)}</span>
      </div>
      <p className="note">
        <code>{r.number}</code> · prepared by {r.created_by} · {when(r.created_at)}
        {r.ticket ? <> · {r.ticket}</> : null}
      </p>
      {r.notes ? <p>{r.notes}</p> : null}
      <AutoNote r={r} paused={paused} />
      {r.preview?.target === "turso" ? <p className="note">Goes to Turso, not production: the last column counts Turso rows. Production is not touched.</p> : null}
      {r.kind === "ds1_step" && r.preview?.file ? <p className="note">Runs <code>{r.preview.file}</code> on DS1 only, in one transaction. Production is not touched.</p> : null}
      {blockers.length ? (
        <ul className="dr-alert" role="alert">
          {blockers.map((b) => <li key={b}>{b}</li>)}
        </ul>
      ) : null}
      {warnings.length ? <ul className="note">{warnings.map((w) => <li key={w}>{w}</li>)}</ul> : null}
      {rows.length ? (
        <div className="scroll"><SortTable columns={columns} rows={rows} param={param} initial={parseSort(query[param], keys(columns), "table.asc")} def="table.asc" label={`Preview of ${r.number}`} /></div>
      ) : null}
    </DecisionCard>
  );
}

const approvalNote = (by: string) => (by.toLowerCase().startsWith("request:") ? ` (scores update requested by ${by.slice(8)})` : isAutoApproved(by) ? " (automatic)" : "");

function recentRow(r: Release): SortRow {
  const t = r.result?.totals ?? {};
  return {
    id: r.id,
    sort: { number: r.number, title: r.title.toLowerCase(), status: r.status, who: r.approved_by ?? r.created_by, when: r.finished_at ?? r.created_at, add: t.add ?? null, change: t.change ?? null, remove: t.remove ?? null, ticket: r.ticket },
    cells: {
      number: <code>{r.number}</code>,
      title: <><strong>{r.title}</strong> <span className="tk-badge">{kindLabel(r.kind)}</span></>,
      status: (
        <>
          <span className={`tk-badge ${tone(r.status)}`}>{r.status.replace("_", " ")}</span>
          {r.error ? <div className="note">{r.error.slice(0, 240)}</div> : null}
        </>
      ),
      who: <>{r.created_by}{r.approved_by ? <div className="note">approved by {r.approved_by}{approvalNote(r.approved_by)}</div> : null}</>,
      when: when(r.finished_at ?? r.created_at),
      add: num(t.add), change: num(t.change), remove: num(t.remove),
      ticket: r.ticket ?? dash,
    },
  };
}

function requestRow(q: ScoreRequest): SortRow {
  return {
    id: q.id,
    sort: { id: q.id, what: q.kind, who: q.requested_by, asked: q.requested_at, status: q.status, summary: q.summary ?? "", release: q.release_number ?? "" },
    cells: {
      id: String(q.id),
      what: q.kind === "drift" ? "drift check" : q.kind === "live" ? `live refresh (${describeRow(q)})` : q.scope || q.league ? `scores update (${describeRow(q)})` : "scores update",
      who: q.requested_by,
      asked: when(q.requested_at),
      status: <span className={`tk-badge ${tone(q.status)}`}>{q.status === "nothing" ? "nothing new" : q.status}</span>,
      summary: q.summary ?? (q.status === "queued" ? "Waiting for the runner (it looks once a minute)." : q.status === "running" ? "Running now." : dash),
      release: q.release_number ? <><code>{q.release_number}</code>{q.release_status ? <div className="note">{q.release_status}</div> : null}</> : dash,
    },
  };
}

function PendingTab({ data, query, paused }: { data: Dashboard; query: Query; paused: boolean }) {
  return (
    <>
      <section className="section">
        <h2>Waiting for you</h2>
        {data.pending.length === 0 ? <p className="note">Nothing is waiting.</p> : data.pending.map((r) => <PendingCard key={r.id} r={r} query={query} paused={paused} />)}
      </section>
      {data.approved.length ? (
        <section className="section">
          <h2>Approved or running</h2>
          {data.approved.map((r) => (
            <p key={r.id}><code>{r.number}</code> {r.title} <span className={`tk-badge ${tone(r.status)}`}>{r.status}</span>{r.approved_by && isAutoApproved(r.approved_by) ? <span className="note"> approved by {r.approved_by}</span> : null}</p>
          ))}
        </section>
      ) : null}
    </>
  );
}

function HistoryTab({ data, query }: { data: Dashboard; query: Query }) {
  const show = parseShow(query.show);
  const sort = parseSort(query.sort, keys(RECENT_COLUMNS), "when.desc");
  const autoSort = parseSort(query.sort_auto, keys(RECENT_COLUMNS), "when.desc");
  const isAuto = (r: Release) => matchesAutoFilter(r.kind, r.approved_by, "auto");
  const main = data.recent.filter((r) => (show === "auto" ? isAuto(r) : show === "all" ? true : !isAuto(r)));
  const folded = show === "collapsed" ? data.recent.filter(isAuto) : [];
  return (
    <section className="section">
      <h2>Recent releases</h2>
      <p className="dr-actions" role="group" aria-label="Filter releases">
        {SHOWS.map((f) => (
          <Link key={f.key} href={f.key === "collapsed" ? "?tab=history" : `?tab=history&show=${f.key}`} className={`tk-badge ${show === f.key ? "live" : ""}`} aria-current={show === f.key ? "true" : undefined}>{f.label}</Link>
        ))}
      </p>
      {main.length === 0 ? <p className="note">{data.recent.length === 0 ? "No release has run yet." : "No release matches this filter."}</p> : (
        <div className="scroll"><SortTable columns={RECENT_COLUMNS} rows={main.map(recentRow)} def="when.desc" initial={sort} label="Recent releases" /></div>
      )}
      {folded.length ? (
        <details>
          <summary>Automatic daily scores ({folded.length})</summary>
          <div className="scroll"><SortTable columns={RECENT_COLUMNS} rows={folded.map(recentRow)} param="sort_auto" def="when.desc" initial={autoSort} label="Automatic daily scores releases" /></div>
        </details>
      ) : null}
    </section>
  );
}

const finished = (data: Dashboard) => data.recent.map((r) => ({ number: r.number, tables: r.tables, status: r.status, finished_at: r.finished_at }));

/** What the comparison says, and when it was taken. A "differs" that a later release overtook is called out of date, not a mismatch. */
function DriftNote({ data }: { data: Dashboard }) {
  const drift = driftState(data.sync, finished(data));
  const at = when(drift.lastChecked);
  return (
    <>
      {drift.differs.length > 0 ? (
        <p className="dr-alert" role="alert">
          Production differed from DS1 in {drift.differs.length} {drift.differs.length === 1 ? "table" : "tables"} when compared at {at}: {drift.differs.map((d) => d.table_name).join(", ")}. A fix is proposed under Pending.
        </p>
      ) : null}
      {drift.outdated.length > 0 ? (
        <p className="note" role="status">
          <strong>Out of date:</strong> {drift.outdated.length} {drift.outdated.length === 1 ? "table was" : "tables were"} reported as different ({drift.outdated.map((d) => d.table_name).join(", ")}),
          but release {drift.newerRelease} finished after that comparison, so they may match now. Press Check now to compare again.
        </p>
      ) : null}
      {drift.lastChecked === null ? <p className="dr-alert" role="alert">No drift check has run yet.</p> : drift.stale ? <p className="dr-alert" role="alert">The last drift check was {at}, more than 36 hours ago.</p> : null}
      {drift.differs.length === 0 && drift.outdated.length === 0 && drift.lastChecked !== null && !drift.stale ? <p className="note">DS1 and production agreed on every table when compared at {at}.</p> : null}
    </>
  );
}

function DriftTab({ data, query }: { data: Dashboard; query: Query }) {
  const blocked = requestBlock(data.requests, data.server_now ? Date.parse(data.server_now) : undefined, data.request_cooldown_minutes, "drift");
  const lastDrift = data.requests.find((q) => q.kind === "drift");
  const syncSort = parseSort(query.sort_sync, keys(SYNC_COLUMNS), "state.asc");
  const spaceSort = parseSort(query.sort_space, keys(SPACE_COLUMNS), "size.desc");
  return (
    <>
      <DriftNote data={data} />
      <section className="section">
        <h2>Check now</h2>
        <p className="note">Compares every table on DS1 and production again (the runner looks for requests once a minute; a check also runs every night). One request at a time, about {data.request_cooldown_minutes} minutes apart.</p>
        <RequestButton kind="drift" blocked={blocked} />
        {lastDrift ? <p className="note">Last request #{lastDrift.id} ({lastDrift.status}): {lastDrift.summary ?? "waiting for the runner"}</p> : null}
      </section>

      <section className="section">
        <h2>Sync status</h2>
        {data.sync.length === 0 ? <p className="note">The nightly check has not written anything yet.</p> : (
          <div className="scroll">
            <SortTable
              columns={SYNC_COLUMNS} param="sort_sync" def="state.asc" initial={syncSort} label="Sync status"
              rows={data.sync.map((s) => ({
                id: s.table_name,
                sort: { table: s.table_name, state: s.state === "differs" ? 0 : 1, ds1: s.ds1_rows, prod: s.prod_rows, checked: s.checked_at, detail: s.detail },
                cells: {
                  table: <code>{s.table_name}</code>,
                  state: <span className={`tk-badge ${s.state === "same" ? "done" : "stale"}`}>{s.state}</span>,
                  ds1: num(s.ds1_rows), prod: num(s.prod_rows), checked: when(s.checked_at), detail: s.detail ?? dash,
                },
              }))}
            />
          </div>
        )}
      </section>

      <section className="section">
        <h2>Production space</h2>
        <p className="note">The whole database uses {bytesLabel(data.database_bytes)}; the plan holds 500 MB and releases stop at 450 MB.</p>
        <div className="scroll">
          <SortTable
            columns={SPACE_COLUMNS} param="sort_space" def="size.desc" initial={spaceSort} label="Production space by table"
            rows={data.space.map((s) => ({ id: s.table, sort: { table: s.table, size: s.bytes }, cells: { table: <code>{s.table}</code>, size: bytesLabel(s.bytes) } }))}
          />
        </div>
      </section>
    </>
  );
}

function SettingsTab({ data, query, paused }: { data: Dashboard; query: Query; paused: boolean }) {
  const reqSort = parseSort(query.sort_req, keys(REQUEST_COLUMNS), "id.desc");
  const blocked = requestBlock(data.requests, data.server_now ? Date.parse(data.server_now) : undefined, data.request_cooldown_minutes);
  return (
    <>
      <section className="section">
        <h2>Auto-approval</h2>
        {data.auto ? (
          <>
            {paused ? (
              <p className="dr-alert" role="alert">
                Auto-approval paused since {when(data.auto.paused_at)} by {data.auto.paused_by} ({data.auto.reason}). Releases are still prepared but wait for you.
              </p>
            ) : (
              <p className="note">Auto-approval is on. A daily scores release that meets the policy approves itself 10 minutes after it is prepared.</p>
            )}
            <AutoSwitch paused={paused} />
          </>
        ) : <p className="note">The auto-approval switch is not set up on production yet (migration 047).</p>}
      </section>

      <section className="section">
        <h2>Scores update</h2>
        <p className="note">
          Asks the runner next to DS1 to fetch the latest scores now (it looks for requests once a minute) and prepare a daily scores release.
          Your click counts as the approval, with no 10 minute wait, but the auto-approval checks and the Hold switch above still apply: anything
          that fails them waits for you under Pending. One request at a time, about {data.request_cooldown_minutes} minutes apart.
          Wikipedia often updates hours after games end, so a request may find nothing new.
          The dialog asks how much to update (a sport, the main five, today&apos;s games, one game) and which sources to read; a refresh of a single game or
          a day&apos;s list is also on every scoreboard, for admins only.
          One league at a time, with each league&apos;s last good load and the games still without a score: <Link href="/admin/ops#ops-scores">Ops, scores by league</Link>.
        </p>
        <RequestButton blocked={blocked} />
        {data.requests.length === 0 ? <p className="note">No request has been made yet.</p> : (
          <div className="scroll"><SortTable columns={REQUEST_COLUMNS} rows={data.requests.map(requestRow)} param="sort_req" def="id.desc" initial={reqSort} label="Scores update requests" /></div>
        )}
      </section>
    </>
  );
}

function Report({ data, query, tab }: { data: Dashboard; query: Query; tab: Tab }) {
  const drift = driftState(data.sync, finished(data));
  const paused = data.auto?.paused === true;
  return (
    <>
      {paused && tab !== "settings" ? (
        <p className="dr-alert" role="alert">
          Auto-approval paused since {when(data.auto?.paused_at)} by {data.auto?.paused_by} ({data.auto?.reason}). Releases are still prepared but wait for you. <Link href="?tab=settings">Settings</Link>
        </p>
      ) : null}
      {drift.differs.length > 0 && tab !== "drift" ? (
        <p className="dr-alert" role="alert">
          Production differed from DS1 in {drift.differs.length} {drift.differs.length === 1 ? "table" : "tables"} when compared at {when(drift.lastChecked)}. <Link href="?tab=drift">Drift</Link>
        </p>
      ) : null}
      {drift.outdated.length > 0 && drift.differs.length === 0 && tab !== "drift" ? (
        <p className="note" role="status">The last comparison ({when(drift.lastChecked)}) is out of date: release {drift.newerRelease} finished after it. <Link href="?tab=drift">Drift</Link></p>
      ) : null}
      <TabMemory tab={tab} />
      {tab === "pending" ? <PendingTab data={data} query={query} paused={paused} /> : null}
      {tab === "history" ? <HistoryTab data={data} query={query} /> : null}
      {tab === "drift" ? <DriftTab data={data} query={query} /> : null}
      {tab === "settings" ? <SettingsTab data={data} query={query} paused={paused} /> : null}
    </>
  );
}

export default async function AdminDataPage({ searchParams }: { searchParams: Promise<Query> }) {
  await requireAdmin();
  const query = await searchParams;
  const tab = parseTab(query.tab, (await cookies()).get(TAB_COOKIE)?.value);
  if (first(query.tab) !== tab) {
    // the admin shell's tab bar reads the tab from the address: send the remembered one there, keeping the rest of the query
    const params = new URLSearchParams({ tab });
    for (const [k, v] of Object.entries(query)) if (k !== "tab" && v !== undefined) for (const x of Array.isArray(v) ? v : [v]) params.append(k, x);
    redirect(`/admin/data?${params.toString()}`);
  }

  let data: Dashboard | null = null;
  let problem = "";
  const [dashboard, events] = await Promise.all([
    releaseDashboard().then((d) => ({ d }), (error: unknown) => ({ error })),
    apiHealth(),
  ]);
  if ("d" in dashboard) data = dashboard.d;
  else problem = dashboard.error instanceof ReleaseError ? dashboard.error.message : "The release data is not available.";
  const health = events ? healthLine(events) : null;

  return (
    <>
      <section className="head fade">
        <h1>Data releases</h1>
        <p className="lede">Production changes only through numbered releases. Approve or reject each one here; the runner next to DS1 applies the approved ones and checks the result.</p>
        {problem ? <p className="note" role="alert">{problem}</p> : null}
        {health ? (
          <p className={health.kind === "down" ? "dr-alert" : "note"} role={health.kind === "down" ? "alert" : "status"}>
            <strong>API health:</strong> <Stamped text={health.text} />
          </p>
        ) : null}
      </section>
      {data ? <Report data={data} query={query} tab={tab} /> : null}
    </>
  );
}
