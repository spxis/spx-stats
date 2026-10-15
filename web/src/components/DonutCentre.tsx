"use client";

import { centreText, fitLength, type CentreItem, type CentreRest } from "@/lib/donutCentre";
import { useSpeaker } from "./i18n/LocaleProvider";

/** The widest a small line may draw inside a donut's hole (its inner diameter is 116 to 120 units; the lines sit below the middle, where it is narrower). */
const MAX = 96;

/**
 * The middle of a donut, as SVG text: the whole at rest, and the figures of `item` while one is under the pointer or the focus.
 * `y` is the baseline of the big figure at rest; the small caption sits 18 units below it.
 */
export function DonutCentre({ rest, item, total, pct, fmtValue, y = 104 }: {
  rest: CentreRest; item: CentreItem | null | undefined; total: number; pct: (share: number) => string;
  /** How a count is written (the reader's number format by default; a stat such as innings pitched writes its own). */
  fmtValue?: (n: number) => string; y?: number;
}) {
  const { say, fmt } = useSpeaker();
  const t = centreText(rest, item, total, fmtValue ?? fmt, pct, (v) => say("donut.centreOf", v));
  if (!t.live) return <><text className="big" x={100} y={y}>{t.big}</text><text className="sub" x={100} y={y + 18}>{t.lines[0]}</text></>;
  return (
    <>
      <text className="big" x={100} y={y - 8}>{t.big}</text>
      {t.lines.map((line, i) => (
        <text key={i} className="sub" x={100} y={y + 10 + i * 13} textLength={fitLength(line, MAX)} lengthAdjust="spacingAndGlyphs">{line}</text>
      ))}
    </>
  );
}
