import { TeamLogo } from "@/components/TeamLogo";
import { fitOf, type Fit } from "@/lib/logoFit";
import { wornYears, type SheetLogo } from "@/lib/logoSheet";
import "./logosheet.css";

const STATUS_LABEL: Record<string, string> = { proposed: "Needs your OK", approved: "Approved", rejected: "Rejected" };

function sourceOf(l: SheetLogo): string {
  if (l.file.startsWith("sl:")) return "SportsLogos.Net";
  if (l.file.startsWith("commons:")) return "Wikimedia Commons";
  if (l.file.startsWith("en:")) return "English Wikipedia";
  return "Other";
}

/** The logo large on a light and a dark page, with the same logo as a circle and a table-size mark. */
function Panels({ url, fit, label }: { url: string; fit: Fit | null; label: string }) {
  return (
    <div className="lc-pair">
      <div className="lc-caption">{label}</div>
      <div className="lc-panels">
        <div className="ls-panel ls-light"><TeamLogo url={url} size={96} shape="square" fit={fit} /><TeamLogo url={url} size={48} shape="circle" fit={fit} /><TeamLogo url={url} fit={fit} /></div>
        <div className="ls-panel ls-dark"><TeamLogo url={url} size={96} shape="square" fit={fit} /><TeamLogo url={url} size={48} shape="circle" fit={fit} /><TeamLogo url={url} fit={fit} /></div>
      </div>
    </div>
  );
}

export function LogoSheet({ logos }: { logos: SheetLogo[] }) {
  return (
    <div className="lc-grid">
      {logos.map((l) => {
        const name = l.teams[0].name;
        const fit = l.fit ? fitOf(l.fit) : null;
        const status = l.fit?.status;
        return (
          <article className={`lc-card${status === "proposed" ? " lc-wait" : ""}`} key={l.file} id={l.file.replace(/[^A-Za-z0-9_.-]+/g, "-")}>
            <header className="lc-top">
              <div>
                <h3>{name}{l.teams.length > 1 ? <span className="note"> + {l.teams.length - 1} more</span> : null}</h3>
                <div className="lc-meta">{l.league.toUpperCase()} &middot; {wornYears(l.from, l.to)}</div>
              </div>
              <span className={`ls-status ls-${status ?? "none"}`}>{status ? STATUS_LABEL[status] : "No fit yet"}</span>
            </header>
            <Panels url={l.url} fit={null} label={fit ? "Now (as the site shows it)" : "As the site shows it"} />
            {fit ? <Panels url={l.url} fit={fit} label={status === "approved" ? "With the approved fit" : "With the proposed fit"} /> : null}
            {l.fit?.note ? <p className="lc-note">{l.fit.note}</p> : null}
            {status === "proposed" ? (
              <p className="lc-ask">
                <b>Your call:</b> if the second row looks better, tell an agent <i>&ldquo;approve the {name} logo&rdquo;</i>. If not, say <i>&ldquo;reject {name}&rdquo;</i>.
              </p>
            ) : null}
            <dl className="lc-facts">
              <dt>Source</dt><dd><a href={l.page ?? l.url} target="_blank" rel="noreferrer" title={l.file}>{sourceOf(l)}</a></dd>
              <dt>Licence</dt><dd>{l.licence ?? "not recorded"}</dd>
              {l.fit ? (
                <>
                  <dt>Fit</dt>
                  <dd title={`scale ${l.fit.scale}, move ${l.fit.dx}/${l.fit.dy}, tile ${l.fit.bg}`}>
                    {l.fit.mark_url ? <>own mark (<a href={l.fit.mark_page ?? l.fit.mark_url} target="_blank" rel="noreferrer">file</a>)</> : l.fit.wordmark ? "wordmark" : "resized"}
                  </dd>
                </>
              ) : null}
            </dl>
          </article>
        );
      })}
    </div>
  );
}
