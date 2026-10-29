import { DbChip } from "@/components/admin/DbChip";
import Link from "next/link";
import { Stamped } from "@/components/LocalTime";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { mark } from "@/lib/localTime";
import { alertView, canWriteLog } from "@/lib/runlog/client";
import { shown } from "@/lib/runlog/rules";
import { dismissAlerts } from "./actions";

/**
 * The alerts of the background jobs, on every admin page (app/(dyn)/admin/layout.tsx): job, league or table, what failed and when. An alert
 * stays until an admin dismisses it; a job's next success marks it "fixed since" but leaves it here, and a repeat failure after a dismissal
 * opens it again (scripts/runlog/runlog.py). Admin only: the layout draws it for an admin and nobody else reaches these pages.
 */
export async function AlertBanner() {
  const s = await currentSpeaker();
  const view = await alertView();
  const list = shown(view.alerts);
  if (!list.length && !view.error) return null;
  const write = canWriteLog();
  const real = list.filter((a) => a.id > 0);
  return (
    <section className="alerts" aria-label={s.say("runs.alert.title")} role="alert">
      {view.error ? <p className="alert-row alert-error">{s.say("runs.alert.unreadable")}</p> : null}
      <ul>
        {list.map((a) => (
          <li key={a.key} className={`alert-row ${a.state === "open" ? (a.severity === "warning" ? "alert-warn" : "alert-error") : "alert-fixed"}`}>
            <div className="alert-text">
              <strong>{a.job}{a.scope ? ` · ${a.scope}` : ""}</strong>{" "}
              <span>{a.message}</span>
              <span className="note">
                {" "}
                <Stamped text={s.say("runs.alert.when", { first: mark(a.first_at), last: mark(a.last_at), repeats: a.repeats })} />
                {a.state !== "open" && a.resolved_at ? <> <Stamped text={s.say("runs.alert.resolvedAt", { time: mark(a.resolved_at) })} /> {s.say("runs.alert.resolved")}</> : null}
              </span>
            </div>
            {a.id > 0 && write ? (
              <form action={dismissAlerts}>
                <input type="hidden" name="id" value={a.id} />
                <button type="submit" className="signin-btn alert-dismiss">{s.say("runs.alert.dismiss")}</button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="alert-foot">
        <DbChip db="turso" />
        <Link href="/admin/runs">{s.say("runs.alert.link")}</Link>
        {real.length > 1 && write ? (
          <form action={dismissAlerts}>
            <button type="submit" className="signin-btn alert-dismiss">{s.say("runs.alert.dismissAll")}</button>
          </form>
        ) : null}
        {!write && list.length ? <span className="note">{s.say("runs.alert.cannotDismiss")}</span> : null}
      </div>
    </section>
  );
}
