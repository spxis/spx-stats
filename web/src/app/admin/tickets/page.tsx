import type { Metadata } from "next";
import Link from "next/link";
import { CopyId } from "@/components/auth/CopyId";
import { SortTable } from "@/components/SortTable";
import { BoardError, boardList } from "@/lib/board/client";
import { BOARD_KINDS, BOARD_PRIORITIES, byQuickWin, holdLabel, isHeldNow, type BoardStatus, type Ticket } from "@/lib/board/rules";
import { requireAdmin } from "@/lib/auth/user";
import { parseSort, type SortColumn, type SortRow } from "@/lib/sort";

/**
 * The ticket board for admins. Admin is checked on the server for every request and anyone else gets a
 * 404. The board token is read in server code only and never reaches the browser. Never cached: the list
 * is read from the board on every request. English only.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const metadata: Metadata = { title: "Tickets", robots: { index: false, follow: false } };

const STATUS_ORDER: BoardStatus[] = ["inProgress", "open", "done", "dropped"];
const STATUS_LABEL: Record<BoardStatus, string> = { inProgress: "In progress", open: "Waiting", done: "Done", dropped: "Dropped" };
const COLUMNS: SortColumn[] = [
  { key: "ticket", label: "Ticket" },
  { key: "status", label: "Status" },
  { key: "kind", label: "Kind" },
  { key: "priority", label: "Priority" },
  { key: "effort", label: "Effort" },
  { key: "filed", label: "Filed", cls: "nowrap" },
  { key: "claimed", label: "Claimed", cls: "nowrap" },
  { key: "done", label: "Done", cls: "nowrap" },
];
const KEYS = COLUMNS.map((c) => c.key);

type Query = { status?: string; kind?: string; priority?: string; q?: string; sort?: string };

const stamp = (iso: string | null) => (iso && !Number.isNaN(Date.parse(iso)) ? iso.slice(0, 16).replace("T", " ") : null);

function statusTone(t: Ticket): string {
  if (t.status === "inProgress") return isHeldNow(t) ? "live" : "stale";
  return t.status;
}

function rowOf(t: Ticket): SortRow {
  const when = (iso: string | null) => {
    const s = stamp(iso);
    return s ? <time dateTime={iso ?? undefined}>{s}</time> : <span className="note">–</span>;
  };
  const dash = <span className="note">–</span>;
  return {
    id: t.id,
    sort: {
      ticket: t.title.toLowerCase(),
      status: STATUS_ORDER.indexOf(t.status),
      kind: t.kind,
      priority: t.priority ? BOARD_PRIORITIES.indexOf(t.priority) : null,
      effort: t.effort === "small" ? 0 : t.effort === "medium" ? 1 : t.effort === "large" ? 2 : null,
      filed: t.createdAt,
      claimed: t.claimedAt,
      done: t.releasedAt,
    },
    cells: {
      ticket: (
        <div className="tk-main">
          <strong>{t.title}</strong>
          {t.detail ? <p className="note tk-detail">{t.detail}</p> : null}
          <CopyId id={t.id} />
        </div>
      ),
      status: (
        <>
          <span className={`tk-badge ${statusTone(t)}`}>{STATUS_LABEL[t.status]}</span>
          {t.claimedBy && t.status !== "done" ? <div className="note">{holdLabel(t)}</div> : null}
        </>
      ),
      kind: <span className={`tk-badge kind-${t.kind}`}>{t.kind}</span>,
      priority: t.priority ? <span className={`tk-badge pri-${t.priority}`}>{t.priority}</span> : dash,
      effort: t.effort ?? dash,
      filed: when(t.createdAt),
      claimed: when(t.claimedAt),
      done: t.releasedAt || t.releasedIn ? <>{when(t.releasedAt)}{t.releasedIn ? <div className="note">{t.releasedIn}</div> : null}</> : dash,
    },
  };
}

export default async function AdminTicketsPage({ searchParams }: { searchParams: Promise<Query> }) {
  await requireAdmin();
  const query = await searchParams;
  const status = STATUS_ORDER.find((s) => s === query.status);
  const kind = BOARD_KINDS.find((k) => k === query.kind);
  const priority = query.priority === "none" ? "none" : BOARD_PRIORITIES.find((p) => p === query.priority);
  const text = (query.q ?? "").trim().slice(0, 100);

  let all: Ticket[];
  try {
    all = (await boardList()).sort(byQuickWin);
  } catch (error) {
    const message = error instanceof BoardError ? error.message : "The board is not available.";
    return (
      <section className="head fade">
        <h1>Tickets</h1>
        <p className="note" role="alert">{message}</p>
      </section>
    );
  }

  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (t: Ticket, ignoreStatus: boolean) =>
    (ignoreStatus || !status || t.status === status) &&
    (!kind || t.kind === kind) &&
    (!priority || (priority === "none" ? t.priority === null : t.priority === priority)) &&
    words.every((w) => `${t.title} ${t.detail ?? ""} ${t.id} ${t.claimedBy ?? ""} ${t.releasedIn ?? ""}`.toLowerCase().includes(w));
  const shown = all.filter((t) => matches(t, false));
  const count = (s: BoardStatus) => all.filter((t) => t.status === s && matches(t, true)).length;
  const sort = parseSort(query.sort, KEYS, "status.asc");

  const href = (next: Partial<Query>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...query, ...next })) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `/admin/tickets?${qs}` : "/admin/tickets";
  };
  const filtered = Boolean(status || kind || priority || text);

  return (
    <>
      <section className="head fade wide">
        <h1>Tickets</h1>
        <p className="lede">The spx-stats board on Sumilabu, read fresh on every visit. <Link href="/admin/tickets/new">File a ticket</Link></p>
        <nav className="tk-chips" aria-label="Filter by status">
          <Link prefetch={false} className={status ? undefined : "on"} href={href({ status: undefined })}>All <span>{all.filter((t) => matches(t, true)).length}</span></Link>
          {STATUS_ORDER.map((s) => (
            <Link prefetch={false} key={s} className={status === s ? "on" : undefined} href={href({ status: s })}>{STATUS_LABEL[s]} <span>{count(s)}</span></Link>
          ))}
        </nav>
        <form className="tk-filters" method="get" action="/admin/tickets">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          {query.sort ? <input type="hidden" name="sort" value={query.sort} /> : null}
          <input type="search" name="q" defaultValue={text} placeholder="Search title, detail, id, who" aria-label="Search tickets" />
          <select name="kind" defaultValue={kind ?? ""} aria-label="Kind">
            <option value="">Any kind</option>
            {BOARD_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <select name="priority" defaultValue={priority ?? ""} aria-label="Priority">
            <option value="">Any priority</option>
            {BOARD_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            <option value="none">ungraded</option>
          </select>
          <button type="submit" className="signin-btn">Filter</button>
          {filtered ? <Link prefetch={false} href="/admin/tickets">Clear</Link> : null}
        </form>
        <p className="note">Showing {shown.length} of {all.length}</p>
      </section>
      <section className="section wide">
        {shown.length === 0 ? (
          <p className="note">No tickets match.</p>
        ) : (
          <div className="scroll"><SortTable columns={COLUMNS} rows={shown.map(rowOf)} def="status.asc" initial={sort} label="Tickets" /></div>
        )}
      </section>
    </>
  );
}
