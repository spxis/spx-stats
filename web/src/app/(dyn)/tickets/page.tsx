import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { boardList } from "@/lib/board/client";
import { byQuickWin, holdLabel } from "@/lib/board/rules";

/**
 * The ticket board, read-only. Tickets can hold internal notes and the board
 * has no read-only key, so the page exists only where TICKETS_PAGE=1 is set
 * (never in production); everywhere else it is a 404. Rendered on the server:
 * the board token never reaches the browser. Internal tool, English only.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tickets", robots: { index: false, follow: false } };

const STATUS_ORDER = ["inProgress", "open", "done", "dropped"] as const;
const STATUS_LABEL = { inProgress: "In progress", open: "Waiting", done: "Done", dropped: "Dropped" } as const;

export default async function TicketsPage() {
  if (process.env.TICKETS_PAGE !== "1") notFound();
  const tickets = (await boardList()).sort(byQuickWin);
  return (
    <>
      <section className="head fade">
        <h1>Tickets</h1>
        <p className="lede">The spx-stats board on Sumilabu. Read-only; change tickets with pnpm task.</p>
      </section>
      {STATUS_ORDER.map((status) => {
        const rows = tickets.filter((t) => t.status === status);
        return (
          <section className="section" key={status}>
            <h2>{STATUS_LABEL[status]} ({rows.length})</h2>
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
                    <code className="note">{t.shortId ? `${t.shortId} · ${t.id}` : t.id}</code>
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
