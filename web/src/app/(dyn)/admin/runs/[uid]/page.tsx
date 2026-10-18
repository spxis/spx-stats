import type { Metadata } from "next";
import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";
import { requireAdmin } from "@/lib/auth/user";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import { getRun } from "@/lib/runlog/client";
import { countsLine, durationSeconds, parseJson, tone } from "@/lib/runlog/rules";
import { tursoConfigured } from "@/lib/turso/client";

/** One entry of the run log in full: facts, counts, what it produced, every step (per league, table or file) and its detail. Admin only, never cached. */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const metadata: Metadata = { title: "Run", robots: { index: false, follow: false } };

const MAX_DETAIL = 20_000;
const pretty = (v: unknown): string => {
  const text = typeof v === "string" ? v : JSON.stringify(v, null, 2);
  return text.length > MAX_DETAIL ? `${text.slice(0, MAX_DETAIL)}\n…` : text;
};

export default async function RunDetail({ params }: { params: Promise<{ uid: string }> }) {
  await requireAdmin();
  const { uid } = await params;
  const s = await currentSpeaker();
  const say = (key: string, vars?: Record<string, string | number>) => s.say(key as PhraseKey, vars);
  let found: Awaited<ReturnType<typeof getRun>> = null;
  let problem = "";
  if (!tursoConfigured()) problem = s.say("runs.notConfigured");
  else {
    try {
      found = await getRun(uid);
    } catch (e) {
      problem = s.say("runs.unavailable", { reason: (e instanceof Error ? e.message : "error").slice(0, 160) });
    }
  }
  if (!found) {
    return (
      <section className="head fade">
        <h1>{s.say("runs.title")}</h1>
        <p className="note" role="alert">{problem || s.say("runs.detail.notFound")}</p>
        <p><Link href="/admin/runs">{s.say("runs.detail.back")}</Link></p>
      </section>
    );
  }
  const { run, items } = found;
  const counts = parseJson(run.counts);
  const detail = parseJson(run.detail);
  const links = parseJson(run.links) as Record<string, unknown> | null;
  const secs = durationSeconds(run.started_at, run.finished_at);
  const release = links && typeof links.release === "string" && /^[0-9.\-]+$/.test(links.release) ? links.release : null;
  return (
    <>
      <section className="head fade">
        <h1>{s.say("runs.detail.title", { job: run.job })}</h1>
        <p><Link href="/admin/runs">{s.say("runs.detail.back")}</Link></p>
        <p><span className={`tk-badge run-${tone(run.outcome)}`}>{run.outcome}</span> {run.summary ?? ""}</p>
      </section>
      <section className="section ops-section" aria-labelledby="run-facts">
        <h2 id="run-facts">{s.say("runs.detail.facts")}</h2>
        <ul className="ops-facts">
          <li>{s.say("runs.detail.started")}: <LocalTime iso={run.started_at} /></li>
          <li>{s.say("runs.detail.finished")}: {run.finished_at ? <><LocalTime iso={run.finished_at} />{secs !== null ? ` (${s.say("runs.seconds", { n: secs })})` : ""}</> : s.say("runs.detail.running")}</li>
          <li>{s.say("runs.col.kind")}: {run.kind}</li>
          {run.scope ? <li>{s.say("runs.detail.scope")}: {run.scope}</li> : null}
          {run.actor ? <li>{s.say("runs.detail.actor")}: {run.actor}</li> : null}
          {run.host ? <li>{s.say("runs.detail.host")}: {run.host}</li> : null}
          {run.ref ? <li>{s.say("runs.detail.ref")}: <code>{run.ref}</code></li> : null}
          {countsLine(counts) ? <li>{s.say("runs.detail.counts")}: {countsLine(counts)}</li> : null}
          {release ? <li>{s.say("runs.detail.links")}: <Link href="/admin/data">{s.say("runs.detail.release", { number: release })}</Link></li> : null}
        </ul>
      </section>
      <section className="section ops-section" aria-labelledby="run-items">
        <h2 id="run-items">{s.say("runs.detail.items")}</h2>
        {items.length ? (
          <table className="runs-table">
            <thead><tr><th>{s.say("runs.item.col.name")}</th><th>{s.say("runs.item.col.outcome")}</th><th>{s.say("runs.item.col.summary")}</th></tr></thead>
            <tbody>
              {items.map((i) => {
                const d = parseJson(i.detail);
                const c = countsLine(parseJson(i.counts));
                return (
                  <tr key={i.seq} className={i.outcome === "failed" ? "ops-diff" : undefined}>
                    <td>{i.name}</td>
                    <td>{i.outcome ? <span className={`tk-badge run-${tone(i.outcome)}`}>{i.outcome}</span> : null}</td>
                    <td>
                      {i.summary ?? ""}{c ? <><br /><span className="note">{c}</span></> : null}
                      {d ? <details><summary className="note">{say("runs.detail.detail")}</summary><pre className="runs-pre">{pretty(d)}</pre></details> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="note">{s.say("runs.detail.itemsNone")}</p>}
      </section>
      <section className="section ops-section" aria-labelledby="run-detail">
        <h2 id="run-detail">{s.say("runs.detail.detail")}</h2>
        {detail ? <pre className="runs-pre">{pretty(detail)}</pre> : <p className="note">{s.say("runs.detail.detailGone")}</p>}
      </section>
    </>
  );
}
