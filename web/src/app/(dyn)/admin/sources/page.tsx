import type { Metadata } from "next";
import { GreyMarker } from "@/components/GreyMarker";
import { SOURCE_REGISTRY } from "@/data/sourceRegistry";
import { byTier, greyOnlyBySource, isGrey } from "@/lib/adminSources";
import { greyOnlyRows } from "@/lib/api/greyOnly";
import { requireAdmin } from "@/lib/auth/user";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";

/**
 * The sources and their tiers for admins: the registry (scripts/daily/sources.py, as the snapshot in data/sourceRegistry.ts) with the tier, the
 * terms note and the evidence link of each, the "grey area" marker on every grey source, and the report of rows held ONLY by a grey source
 * (api.grey_only_rows, migration 153), which are to be replaced by legal data over time. Admin only, drawn per request.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const metadata: Metadata = { title: "Sources", robots: { index: false, follow: false } };

export default async function SourcesPage() {
  await requireAdmin();
  const s = await currentSpeaker();
  const say = (key: string, vars?: Record<string, string | number>) => s.say(key as PhraseKey, vars);
  let report: Awaited<ReturnType<typeof greyOnlyRows>> = null;
  let problem = "";
  try {
    report = await greyOnlyRows();
  } catch (e) {
    problem = e instanceof Error ? e.message : "error";
  }
  const grouped = report ? greyOnlyBySource(report) : [];
  return (
    <>
      <section className="head fade">
        <h1>{say("asrc.title")}</h1>
        <p className="lede">{say("asrc.lede")}</p>
      </section>
      <section className="section ops-section" aria-labelledby="src-report">
        <h2 id="src-report">{say("asrc.report.title")}</h2>
        <p className="note">{say("asrc.report.lede")}</p>
        {problem ? <p className="note" role="alert">{problem.slice(0, 160)}</p> : null}
        {!problem && report === null ? <p className="note">{say("asrc.report.missing")}</p> : null}
        {report && !grouped.length ? <p className="note">{say("asrc.report.none")}</p> : null}
        {grouped.length ? (
          <div className="runs-wrap">
            <table className="runs-table">
              <thead>
                <tr><th>{say("asrc.report.col.source")}</th><th>{say("asrc.report.col.kinds")}</th><th>{say("asrc.report.col.total")}</th></tr>
              </thead>
              <tbody>
                {grouped.map((g) => {
                  const entry = SOURCE_REGISTRY.find((x) => x.id === g.source);
                  return (
                    <tr key={g.source} className="ops-diff">
                      <td>{entry?.name ?? g.source} <GreyMarker s={s} /></td>
                      <td>{g.kinds.map((k) => `${k.kind}: ${k.n}`).join(", ")}</td>
                      <td>{g.total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      <section className="section ops-section" aria-labelledby="src-list">
        <h2 id="src-list">{say("asrc.col.source")}</h2>
        <div className="runs-wrap">
          <table className="runs-table">
            <thead>
              <tr>
                <th>{say("asrc.col.source")}</th><th>{say("asrc.col.tier")}</th><th>{say("asrc.col.terms")}</th>
                <th>{say("asrc.col.limits")}</th><th>{say("asrc.col.leagues")}</th>
              </tr>
            </thead>
            <tbody>
              {byTier().map((e) => (
                <tr key={e.id} className={isGrey(e) ? "ops-diff" : undefined}>
                  <td>{e.name}<br /><span className="note"><code>{e.id}</code></span></td>
                  <td>
                    <span className="tk-badge">{say(`asrc.tier.${e.tier}`)}</span> {isGrey(e) ? <GreyMarker s={s} /> : null}
                    {e.keyNeeded ? <><br /><span className="note">{say("asrc.keyNeeded")}</span></> : null}
                  </td>
                  <td>
                    {e.notes || e.reason}
                    <p className="note src-note">
                      {e.evidence ? <a href={e.evidence} rel="noreferrer noopener" target="_blank">{say("asrc.evidence")}</a> : say("asrc.noEvidence")}
                      {e.checkedOn && e.checkedBy ? <> · {say("asrc.checked", { on: e.checkedOn, by: e.checkedBy })}</> : null}
                    </p>
                  </td>
                  <td>
                    {e.spacingSeconds === null ? <span className="note">–</span> : e.dailyCap
                      ? say("asrc.limits", { seconds: e.spacingSeconds, cap: e.dailyCap })
                      : say("asrc.limitsSpacing", { seconds: e.spacingSeconds })}
                  </td>
                  <td>{e.leagues.length ? e.leagues.join(", ").toUpperCase() : <span className="note">–</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
