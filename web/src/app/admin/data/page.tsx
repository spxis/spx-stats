import type { Metadata } from "next";
import { SortTable } from "@/components/SortTable";
import { requireAdmin } from "@/lib/auth/user";
import { ReleaseError, releaseDashboard, type Dashboard, type Release } from "@/lib/releases/client";
import { RESULT_MESSAGES, bytesLabel, driftState, stamp } from "@/lib/releases/rules";
import { parseSort, type SortColumn, type SortRow } from "@/lib/sort";
import { decide } from "./actions";

/**
 * Data releases for admins: what is waiting for approval, what ran, whether DS1 and production agree, and how much space
 * production uses. Admin is checked on the server for every request and anyone else gets a 404. Never cached. English only.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const metadata: Metadata = { title: "Data releases", robots: { index: false, follow: false } };

type Query = Record<string, string | string[] | undefined>;

const dash = <span className="note">–</span>;
const when = (iso: string | null) => {
  const s = stamp(iso);
  return s ? <time dateTime={iso ?? undefined}>{s}</time> : dash;
};
const tone = (status: string) => (status === "done" ? "done" : status === "failed" ? "stale" : status === "running" || status === "approved" ? "live" : "");

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

function PendingCard({ r, query }: { r: Release; query: Query }) {
  const blockers = r.preview?.blockers ?? [];
  const warnings = r.preview?.warnings ?? [];
  const { columns, rows } = previewRows(r);
  const param = `sort_r${r.id}`;
  return (
    <article className="dr-card" aria-label={`Release ${r.number}`}>
      <div>
        <strong>{r.title}</strong>{" "}
        <span className="tk-badge">{r.kind === "ds1_step" ? "DS1 step" : r.kind}</span>
      </div>
      <p className="note">
        <code>{r.number}</code> · prepared by {r.created_by} · {when(r.created_at)}
        {r.ticket ? <> · {r.ticket}</> : null}
      </p>
      {r.notes ? <p>{r.notes}</p> : null}
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
      <form action={decide} className="dr-actions">
        <input type="hidden" name="id" value={r.id} />
        <button type="submit" name="decision" value="approve" className="signin-btn" disabled={blockers.length > 0}>
          {r.kind === "ds1_step" ? "Approve and run on DS1" : "Approve and publish"}
        </button>
        <button type="submit" name="decision" value="reject" className="signin-btn dr-reject">Reject</button>
      </form>
    </article>
  );
}

function recentRow(r: Release): SortRow {
  const t = r.result?.totals ?? {};
  return {
    id: r.id,
    sort: { number: r.number, title: r.title.toLowerCase(), status: r.status, who: r.approved_by ?? r.created_by, when: r.finished_at ?? r.created_at, add: t.add ?? null, change: t.change ?? null, remove: t.remove ?? null, ticket: r.ticket },
    cells: {
      number: <code>{r.number}</code>,
      title: <><strong>{r.title}</strong> <span className="tk-badge">{r.kind === "ds1_step" ? "DS1 step" : r.kind}</span></>,
      status: (
        <>
          <span className={`tk-badge ${tone(r.status)}`}>{r.status.replace("_", " ")}</span>
          {r.error ? <div className="note">{r.error.slice(0, 240)}</div> : null}
        </>
      ),
      who: <>{r.created_by}{r.approved_by ? <div className="note">approved by {r.approved_by}</div> : null}</>,
      when: when(r.finished_at ?? r.created_at),
      add: num(t.add), change: num(t.change), remove: num(t.remove),
      ticket: r.ticket ?? dash,
    },
  };
}

function Report({ data, query }: { data: Dashboard; query: Query }) {
  const drift = driftState(data.sync);
  const recentSort = parseSort(query.sort, keys(RECENT_COLUMNS), "when.desc");
  const syncSort = parseSort(query.sort_sync, keys(SYNC_COLUMNS), "state.asc");
  const spaceSort = parseSort(query.sort_space, keys(SPACE_COLUMNS), "size.desc");
  return (
    <>
      {drift.differs.length > 0 || drift.stale ? (
        <p className="dr-alert" role="alert">
          {drift.differs.length > 0 ? <>Production differs from DS1 in {drift.differs.length} {drift.differs.length === 1 ? "table" : "tables"}: {drift.differs.map((d) => d.table_name).join(", ")}. </> : null}
          {drift.lastChecked === null ? "No drift check has run yet." : drift.stale ? `The last drift check was ${stamp(drift.lastChecked)} UTC, more than 36 hours ago.` : null}
        </p>
      ) : (
        <p className="note">DS1 and production agree on every table. Last checked {stamp(drift.lastChecked)} UTC.</p>
      )}

      <section className="section">
        <h2>Waiting for you</h2>
        {data.pending.length === 0 ? <p className="note">Nothing is waiting.</p> : data.pending.map((r) => <PendingCard key={r.id} r={r} query={query} />)}
      </section>

      {data.approved.length ? (
        <section className="section">
          <h2>Approved or running</h2>
          {data.approved.map((r) => (
            <p key={r.id}><code>{r.number}</code> {r.title} <span className={`tk-badge ${tone(r.status)}`}>{r.status}</span></p>
          ))}
        </section>
      ) : null}

      <section className="section">
        <h2>Recent releases</h2>
        {data.recent.length === 0 ? <p className="note">No release has run yet.</p> : (
          <div className="scroll"><SortTable columns={RECENT_COLUMNS} rows={data.recent.map(recentRow)} def="when.desc" initial={recentSort} label="Recent releases" /></div>
        )}
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

export default async function AdminDataPage({ searchParams }: { searchParams: Promise<Query> }) {
  await requireAdmin();
  const query = await searchParams;
  const result = typeof query.result === "string" ? RESULT_MESSAGES[query.result] : undefined;

  let data: Dashboard | null = null;
  let problem = "";
  try {
    data = await releaseDashboard();
  } catch (error) {
    problem = error instanceof ReleaseError ? error.message : "The release data is not available.";
  }

  return (
    <>
      <section className="head fade">
        <h1>Data releases</h1>
        <p className="lede">Production changes only through numbered releases. Approve or reject each one here; the runner next to DS1 applies the approved ones and checks the result.</p>
        {result ? <p role="status"><strong>{result}</strong></p> : null}
        {problem ? <p className="note" role="alert">{problem}</p> : null}
      </section>
      {data ? <Report data={data} query={query} /> : null}
    </>
  );
}
