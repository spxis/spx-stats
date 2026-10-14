import type { Knockout as Drawing } from "@/lib/bracketDraw";
import "./knockout.css";

/**
 * A knockout bracket as Taisen Brackets draws it (lib/bracketDraw.ts): the same bracket twice, the desk's and the phone's, one shown by the stylesheet at each
 * width (knockout.css). The SVG strings are the package's own, written by the server, trusted and never built from a reader's text; the team names inside are
 * escaped by the package. Every box is a link to its series or match. `dim` is a stylesheet that fades the boxes whose address it names (a chosen division).
 */
export function Knockout({ art, dim }: { art: Drawing; dim?: string }) {
  return (
    <div className="kobracket">
      {dim ? <style>{dim}</style> : null}
      <div className="ko-wide" dangerouslySetInnerHTML={{ __html: art.wide }} />
      <div className="ko-phone" dangerouslySetInnerHTML={{ __html: art.phone }} />
    </div>
  );
}
