import type { Metadata } from "next";
import Link from "next/link";
import { Stamped } from "@/components/LocalTime";
import { requireAdmin } from "@/lib/auth/user";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import { opsDashboard } from "@/lib/ops/client";
import { mark } from "@/lib/localTime";
import { asOf, issues, queuedOf } from "@/lib/ops/rules";
import type { Dashboard } from "@/lib/ops/schema";
import { ReleaseError } from "@/lib/releases/client";
import { OpsButton } from "./OpsButton";
import { OpsRefresh } from "./OpsRefresh";
import { agoText, BackupSection, DailySection, HarvesterSection, ReleasesSection, RequestsSection, ScoresSection, SyncSection, WatchdogSection } from "./sections";

/**
 * Ops: a very internal view of the DS1 side for admins. Production (Vercel) cannot reach DS1 and must not, so this page only reads what the
 * runner next to DS1 pushed into production about every 15 minutes (meta.ops_status, migration 104, through api.ops_dashboard) and writes
 * requests the runner acts on within a minute (Snapshot now, Pause and Resume harvester; "Check drift now" is the existing drift request).
 * Admin is checked on the server for every request and anyone else gets a 404. Never cached. In the reader's language.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const metadata: Metadata = { title: "Ops", robots: { index: false, follow: false } };

type Query = Record<string, string | string[] | undefined>;

export default async function AdminOpsPage({ searchParams }: { searchParams: Promise<Query> }) {
  await requireAdmin();
  const query = await searchParams;
  const s = await currentSpeaker();

  let data: Dashboard | null = null;
  let problem = "";
  try {
    data = await opsDashboard();
  } catch (error) {
    problem = error instanceof ReleaseError ? error.message : "The ops data is not available.";
  }
  const latest = data?.latest ?? null;
  const when = data && latest ? asOf(latest.taken_at, data.server_now) : null;
  const found = data && latest ? issues(data) : [];

  return (
    <>
      <section className="head fade">
        <h1>{s.say("ops.title")}</h1>
        <p className="lede">{s.say("ops.lede")}</p>
        {problem ? <p className="note" role="alert">{s.say("ops.unavailable", { reason: problem })}</p> : null}
        {data && !latest ? <p className="dr-alert" role="alert">{s.say("ops.noSnapshot")}</p> : null}
        {when && latest ? (
          <p className={when.stale ? "dr-alert" : "note"} role={when.stale ? "alert" : "status"}>
            <strong><Stamped text={s.say("ops.asOf", { time: mark(latest.taken_at, "clock"), ago: agoText(s, when.minutes) })} /></strong>
          </p>
        ) : null}
        <div className="ops-top">
          {data ? <OpsButton kind="snapshot" waiting={queuedOf(data.requests, "snapshot") !== null} /> : null}
          <Link href="/admin/data">{s.say("ops.links.releases")}</Link>
        </div>
        <p className="note">{s.say("ops.refreshNote")}</p>
      </section>

      {data && latest ? (
        <>
          <section className="section" aria-labelledby="ops-issues">
            <h2 id="ops-issues">{s.say("ops.issues.title")}</h2>
            {found.length === 0 ? <p className="note">{s.say("ops.issues.none")}</p> : (
              <ul className={found.some((i) => i.level === "bad") ? "dr-alert" : "note"} role={found.some((i) => i.level === "bad") ? "alert" : "status"}>
                {found.map((i, n) => <li key={`${i.key}-${n}`}>{s.say(`ops.issue.${i.key}` as PhraseKey, i.vars)}</li>)}
              </ul>
            )}
          </section>
          <ScoresSection s={s} sc={latest.payload.scores} at={latest.payload.at} requests={data.score_requests} now={data.server_now} query={query} />
          <div className="ops-grid">
            <HarvesterSection s={s} h={latest.payload.harvester} at={latest.payload.at} history={data.history} requests={data.requests} query={query} />
            <BackupSection s={s} b={latest.payload.backup} at={latest.payload.at} />
            <SyncSection s={s} y={latest.payload.sync} at={latest.payload.at} query={query} />
            <DailySection s={s} d={latest.payload.daily} at={latest.payload.at} />
            <WatchdogSection s={s} w={latest.payload.watchdog} at={latest.payload.at} />
            <ReleasesSection s={s} r={latest.payload.releases} />
          </div>
          <RequestsSection s={s} requests={data.requests} query={query} />
        </>
      ) : null}
      <OpsRefresh />
    </>
  );
}
