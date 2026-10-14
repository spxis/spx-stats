import type { CSSProperties, ReactNode } from "react";
import type { Bracket, BracketSide, Box } from "@/lib/bracketLayout";
import "./series.css";

/** Where a box sits (lib/bracketLayout.ts), as the box component takes it. */
export interface BoxPos { y: number; to: number | null; fed: boolean; last?: boolean; final?: boolean }

/**
 * The frame of a knockout bracket: one half down each side, the final in the middle, connector lines between the boxes (series.css). It draws no tie itself:
 * `box` draws one (an absolutely positioned `.bx` at `pos`), `heading` and `finalHeading` the column titles (an `<h4>`). So a hockey playoff and a World Cup
 * share one frame. `show` hides a half; `row` is the height of a row in px and `colw` the narrowest a column may be (the frame scrolls sideways below that
 * on a phone, as the playoff bracket always did). Sport-agnostic: no sport words and no data access.
 */
export function BracketFrame({ bracket: b, heading, finalHeading, box, show = () => true, row = 56, colw = 112 }: {
  bracket: Bracket;
  heading: (round: number) => ReactNode;
  finalHeading: ReactNode;
  box: (i: number, pos: BoxPos, top?: 0 | 1) => ReactNode;
  show?: (side: BracketSide) => boolean;
  row?: number;
  colw?: number;
}) {
  const labelled = b.sides.some((s) => s.label);
  const left = b.sides.find((s) => s.key === "l" && show(s)), right = b.sides.find((s) => s.key === "r" && show(s));
  const sideEl = (side: BracketSide) => (
    <div key={side.key} className={`bkside ${side.key}`} style={{ "--n": b.columns.length } as CSSProperties}>
      {labelled ? <h3 className="bkconf">{side.label ?? " "}</h3> : null}
      <div className="bkcols">
        {b.columns.map((r) => (
          <div key={r} className="bkcol">
            {heading(r)}
            <div className="bkarea" style={{ height: `calc(var(--row) * ${b.rows})` }}>
              {side.boxes.filter((x: Box) => x.round === r).map((x: Box) => box(x.i, { y: x.y, to: x.to, fed: x.fed, last: r === b.columns.at(-1) }))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div className="bkwrap">
      <div className={`bk${b.final ? "" : " solo"}${b.final && !left !== !right ? " half" : ""}`} style={{ "--row": `${row}px`, "--colw": `${colw}px`, "--n": b.columns.length } as CSSProperties}>
        {left ? sideEl(left) : null}
        {b.final ? (
          <div className="bkside bkfinal">
            {labelled ? <h3 className="bkconf" aria-hidden="true">{" "}</h3> : null}
            <div className="bkcols">
              <div className="bkcol">
                {finalHeading}
                <div className="bkarea" style={{ height: `calc(var(--row) * ${b.rows})` }}>
                  {box(b.final.i, { y: b.final.y, to: null, fed: b.sides.length > 0, final: true }, b.final.order[0] === 1 ? 1 : 0)}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {right ? sideEl(right) : null}
      </div>
    </div>
  );
}
