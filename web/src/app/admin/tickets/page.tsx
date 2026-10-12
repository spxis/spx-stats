import type { Metadata } from "next";
import Link from "next/link";
import { BoardError, boardList } from "@/lib/board/client";
import { byQuickWin, holdLabel, type BoardStatus } from "@/lib/board/rules";
import { requireAdmin } from "@/lib/auth/user";

/**
 * The ticket board for admins. Admin is checked on the server for every request and anyone else gets a
 * 404. The board token is read in server code only and never reaches the browser. English only.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tickets", robots: { index: false, follow: false } };

const STATUS_ORDER: BoardStatus[] = ["inProgress", "open", "done", "dropped"];
const STATUS_LABEL: Record<BoardStatus, string> = { inProgress: "In progress", open: "Waiting", done: "Done", dropped: "Dropped" };

export default async function AdminTicketsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin();
  const { status } = await searchParams;
  const only = STATUS_ORDER.find((s) => s === status);
  let tickets;
  try {
    tickets = (await boardList()).sort(byQuickWin);
  } catch (error) {
    const message = error instanceof BoardError ? error.message : "The board is not available.";
    return (
      <section className="head fade">
        <h1>Tickets</h1>
        <p className="note" role="alert">{message}</p>
      </section>
    );
  }
  return (
    <>
      <section className="head fade">
        <h1>Tickets</h1>
        <p className="lede">The spx-stats board on Sumilabu. <Link href="/admin/tickets/new">File a ticket</Link></p>
        <nav className="note" aria-label="Filter by status">
          <Link href="/admin/tickets">All</Link>
          {STATUS_ORDER.map((s) => <span key={s}> · <Link href={`/admin/tickets?status=${s}`}>{STATUS_LABEL[s]}</Link></span>)}
        </nav>
      </section>
      {STATUS_ORDER.filter((s) => !only || s === only).map((s) => {
        const rows = tickets.filter((t) => t.status === s);
        return (
          <section className="section" key={s}>
            <h2>{STATUS_LABEL[s]} ({rows.length})</h2>
            {rows.length === 0 ? (
              <p className="note">Nothing here.</p>
            ) : (
              <ul>
                {rows.map((t) => (
                  <li key={t.id}>
                    <strong>{t.title}</strong>{" "}
                    <span className="note">
                      {[t.kind, t.priority && `P:${t.priority}`, t.effort && `E:${t.effort}`, t.claimedBy && holdLabel(t), t.releasedIn].filter(Boolean).join(" · ")}
                    </span>
                    {t.detail ? <p className="note">{t.detail}</p> : null}
                    <code className="note">{t.id}</code>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}
