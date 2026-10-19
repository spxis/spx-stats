import Link from "@/components/Link";
import type { Speaker } from "@/lib/i18n/i18n";
import { releaseDay, type SiteRelease } from "@/lib/siteReleases";
import "./releases.css";

/** One entry per site version, the version number first. Plain server markup: the text is the page. */
export function ReleaseList({ rows, say, dt }: { rows: readonly SiteRelease[]; say: Speaker["say"]; dt: Speaker["dt"] }) {
  return (
    <ol className="relist">
      {rows.map((r) => (
        <li key={r.version} id={`v${r.version}`} className="rel">
          <a className="rel-v" href={`#v${r.version}`}>{r.version}</a>
          <div className="rel-main">
            <h2>{r.title}</h2>
            <p className={r.needsReview ? "rel-quiet" : undefined}>{r.text}</p>
            <div className="rel-meta">
              <time dateTime={r.date}>{dt.ymd(releaseDay(r))}</time>
              {r.sha ? <span className="rel-sha">{r.sha}</span> : null}
              {r.href ? <Link className="rel-see" href={r.href}>{say("releases.see")}</Link> : null}
              {r.needsReview ? <span>{say("releases.quiet")}</span> : null}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
