import { TeamLogo } from "@/components/TeamLogo";
import { fitOf, type Fit } from "@/lib/logoFit";
import { wornYears, type SheetLogo } from "@/lib/logoSheet";
import "./logosheet.css";

/**
 * How one picture looks in each box the site has, on a light and a dark page: a circle at 48 and 24 px, a square, and a table row.
 * `fit` is the fit to apply (null: the logo exactly as the site draws it with no fit).
 */
function Boxes({ url, fit, name }: { url: string; fit: Fit | null; name: string }) {
  return (
    <div className="ls-boxes">
      <TeamLogo url={url} size={48} shape="circle" fit={fit} />
      <TeamLogo url={url} size={24} shape="circle" fit={fit} />
      <TeamLogo url={url} size={32} shape="square" fit={fit} />
      <table className="ls-row" aria-hidden="true">
        <tbody>
          <tr>
            <td><TeamLogo url={url} fit={fit} />{name}</td>
            <td className="num">48</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** The two pages a logo must read on. Their colours are the site's own tokens, written out so the sheet shows both at once. */
function Panels({ url, fit, name }: { url: string; fit: Fit | null; name: string }) {
  return (
    <>
      <div className="ls-panel ls-light"><Boxes url={url} fit={fit} name={name} /></div>
      <div className="ls-panel ls-dark"><Boxes url={url} fit={fit} name={name} /></div>
    </>
  );
}

const STATUS_NOTE: Record<string, string> = { proposed: "proposed", approved: "approved", rejected: "rejected" };

export function LogoSheet({ logos }: { logos: SheetLogo[] }) {
  return (
    <div className="ls">
      <div className="ls-head">
        <span>Team and logo file</span>
        <span>Plain logo, light page</span>
        <span>Plain logo, dark page</span>
        <span>With the fit, light page</span>
        <span>With the fit, dark page</span>
      </div>
      {logos.map((l) => {
        const name = l.teams[0].name;
        const fit = l.fit ? fitOf(l.fit) : null;
        return (
          <div className="ls-item" key={l.file} id={l.file.replace(/[^A-Za-z0-9_.-]+/g, "-")}>
            <div className="ls-who">
              <b>{name}</b>{l.teams.length > 1 ? <span className="note"> and {l.teams.length - 1} more</span> : null}
              <div className="note">{l.league.toUpperCase()}, {wornYears(l.from, l.to)}</div>
              <div className="note ls-file"><a href={l.page ?? l.url} target="_blank" rel="noreferrer">{l.file}</a></div>
              <div className="note">{l.licence ?? "licence not recorded"}</div>
              {l.fit ? (
                <div className="ls-fit">
                  <span className={`ls-status ls-${l.fit.status}`}>{STATUS_NOTE[l.fit.status]}</span>{" "}
                  {l.fit.wordmark ? "wordmark; " : ""}{l.fit.mark_url ? "own mark; " : ""}scale {l.fit.scale}, move {l.fit.dx}/{l.fit.dy}, tile {l.fit.bg}
                  {l.fit.note ? <div className="note">{l.fit.note}</div> : null}
                  {l.fit.mark_url ? <div className="note"><a href={l.fit.mark_page ?? l.fit.mark_url} target="_blank" rel="noreferrer">mark file</a>, {l.fit.mark_licence}</div> : null}
                </div>
              ) : null}
              <div className="ls-raw">
                {/* eslint-disable-next-line @next/next/no-img-element -- the raw file, shown as it is */}
                <img src={l.url} alt="" height={64} referrerPolicy="no-referrer" loading="lazy" />
              </div>
            </div>
            <Panels url={l.url} fit={null} name={name} />
            {fit ? <Panels url={l.url} fit={fit} name={name} /> : <div className="ls-same note">no fit: drawn as the plain logo</div>}
          </div>
        );
      })}
    </div>
  );
}
