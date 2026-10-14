import type { Knockout as Drawing } from "@/lib/bracketDraw";
import "./knockout.css";

/**
 * A knockout bracket as Taisen Brackets draws it (lib/bracketDraw.ts): the same bracket twice, the desk's and the phone's, one shown by the stylesheet at each
 * width (knockout.css). The SVG strings are the package's own, written by the server, trusted and never built from a reader's text; the team names inside are
 * escaped by the package. Every box is a link to its series or match. A page can fade a tie with the class `ko-dim` (the package's `tieClass`; a chosen division).
 */
export function Knockout({ art }: { art: Drawing }) {
  return (
    <div className="kobracket">
      <div className="ko-wide" dangerouslySetInnerHTML={{ __html: art.wide }} />
      <div className="ko-phone" dangerouslySetInnerHTML={{ __html: art.phone }} />
    </div>
  );
}
