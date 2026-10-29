"use client";

import { useDeferredValue, useMemo, useState } from "react";
import type { Side } from "@/lib/battedBall";
import { LOCALE_TAG } from "@/lib/locale";
import {
  ballTypes, decodeRows, FIELD_BOX, hasBalls, homeRunBubbles, homeRunLanes, KINDS, SPRAY_DENSE_FROM, SPRAY_FROM, sprayLayers, summarize,
  type Role, type SprayWire,
} from "@/lib/playerSpray";
import { useSpeaker } from "./i18n/LocaleProvider";
import { Rich } from "./i18n/Rich";
import { RoadArt } from "./RoadArt";
import { useFetchedJson } from "./useFetchedJson";
import { useSeen } from "./useSeen";
import "./fieldplays.css";
import "./playerspray.css";

/** The marks of the key as small shapes; the shapes are drawn by fieldplays.css. */
const DOT_SHAPE: Record<string, string> = { single: "circle", double: "diamond", triple: "triangle", "home run": "star", reached: "square", out: "circle" };
const VIEW_BOX = `${FIELD_BOX.x} ${FIELD_BOX.y} ${FIELD_BOX.w} ${FIELD_BOX.h}`;
const SIDES: { side: Side; phrase: "spray.dirPull" | "spray.dirCentre" | "spray.dirOppo" }[] = [
  { side: "pull", phrase: "spray.dirPull" }, { side: "centre", phrase: "spray.dirCentre" }, { side: "oppo", phrase: "spray.dirOppo" },
];

/**
 * The spray section of an MLB player's page: where the balls he hit (or, for a pitcher, the balls hit against him) in the seasons chosen on the board came down,
 * in Retrosheet's hit-location zones, as the game page draws them; his home runs by zone; how often the balls went to the pulled, middle and opposite thirds of the
 * field; and the shares of ground balls, line drives, fly balls and pop-ups. Fetched when it comes near (`/api/players/<id>/spray`, a few kilobytes packed), drawn in
 * the browser from it as the season slider moves, over the standard field's file. A player with no row leaves the section out.
 */
export function PlayerSpray({ id, name, position, from, to }: { id: number; name: string; position: string | null; from: number; to: number }) {
  const { say, fmt, locale } = useSpeaker();
  const [ref, seen] = useSeen<HTMLElement>("600px 0px");
  const { state, data } = useFetchedJson<SprayWire>(`/api/players/${id}/spray`, "spray", seen);
  const rows = useMemo(() => (data ? decodeRows(data) : []), [data]);
  const span = useDeferredValue({ from, to });
  const [pick, setPick] = useState<Role | null>(null);
  const [outs, setOuts] = useState(false);

  const bat = hasBalls(rows, "bat", span.from, span.to), pit = hasBalls(rows, "pit", span.from, span.to);
  const first: Role = position === "P" && pit ? "pit" : bat ? "bat" : "pit";
  const role: Role = pick && (pick === "bat" ? bat : pit) ? pick : first;
  const sum = useMemo(() => summarize(rows, role, span.from, span.to), [rows, role, span]);
  const layers = useMemo(() => sprayLayers(sum.zones, outs), [sum, outs]);
  const bubbles = useMemo(() => homeRunBubbles(sum.zones), [sum]);
  const lanes = useMemo(() => homeRunLanes(sum.zones), [sum]);

  if (state === "empty") return null;
  const pct = (v: number) => {
    try { return new Intl.NumberFormat(LOCALE_TAG[locale], { style: "percent", maximumFractionDigits: 0 }).format(v); } catch { return `${Math.round(v * 100)}%`; }
  };
  const src = `/field-plays/std.${locale}.svg`;
  const ratio = FIELD_BOX.w / FIELD_BOX.h;
  const hits = (sum.results[1] ?? 0) + (sum.results[2] ?? 0) + (sum.results[3] ?? 0) + (sum.results[4] ?? 0);
  const total = sum.n;
  const types = ballTypes(sum.traj);
  const typeTotal = types.reduce((s, t) => s + t.n, 0);
  const countOf = (k: (typeof KINDS)[number]) => k.results.reduce((s, i) => s + (sum.results[i] ?? 0), 0);
  const first86 = span.to < SPRAY_FROM;
  const partial = !first86 && span.from < SPRAY_DENSE_FROM;
  const seasons = sum.years.length === 1 ? say("spray.oneSeason") : say("spray.seasons", { n: fmt(sum.years.length) });
  const lede = say(role === "pit" ? "spray.ledePit" : "spray.ledeBat", { name });

  return (
    <section ref={ref} id="spray" className="section pspray" style={{ minHeight: state === "done" ? undefined : 360 }}>
      <h2>{say("spray.head")}</h2>
      {state === "failed" ? <p className="note">{say("spray.failed")}</p> : null}
      {state === "loading" ? <p className="note" role="status">{say("spray.loading")}</p> : null}
      {state === "done" ? (
        <>
          <p className="note">{lede}</p>
          <div className="pcontrols">
            {bat && pit ? (
              <div className="seg" role="group" aria-label={say("spray.roleAria")}>
                {(["bat", "pit"] as Role[]).map((r) => (
                  <button key={r} type="button" aria-pressed={role === r} onClick={() => setPick(r)}>{say(r === "bat" ? "spray.roleBat" : "spray.rolePit")}</button>
                ))}
              </div>
            ) : null}
            <button type="button" className="seg-one" aria-pressed={outs} onClick={() => setOuts((v) => !v)}>{say("spray.outs")}</button>
          </div>
          {total === 0 ? <p className="note">{say(first86 ? "spray.none" : "spray.noneRole")}</p> : (
            <>
              <p className="note psummary">{say("spray.balls", { n: fmt(total), seasons })}</p>
              <ul className="fplay fplay-key pspray-key" aria-label={say("fp.keyAria")}>
                {KINDS.filter((k) => outs || (k.kind !== "out" && k.kind !== "reached")).map((k) => (
                  <li key={k.kind}><i className="fk" data-shape={DOT_SHAPE[k.kind]} style={{ "--fk": k.color } as React.CSSProperties} aria-hidden="true" />{say("spray.keyCount", { kind: say(k.phrase as "fp.single"), n: fmt(countOf(k)) })}</li>
                ))}
              </ul>
              <div className="pspray-grid">
                <figure className="fplay pspray-fig" data-sport="mlb">
                  <figcaption className="pspray-cap">{say(outs ? "spray.chartAll" : "spray.chartHits")}</figcaption>
                  <div className="pspray-stage">
                    <RoadArt className="fplay-art" src={src} ratio={ratio} />
                    <svg className="pspray-marks" viewBox={VIEW_BOX} role="img" aria-label={say("spray.chartAria", { name, hits: fmt(hits), outs: fmt(total - hits) })}>
                      {layers.map((l) => <path key={l.kind} d={l.d} fill={l.color} />)}
                    </svg>
                  </div>
                </figure>
                <figure className="fplay pspray-fig" data-sport="mlb">
                  <figcaption className="pspray-cap">{say("spray.hrHead")}</figcaption>
                  <div className="pspray-stage">
                    <RoadArt className="fplay-art" src={src} ratio={ratio} />
                    <svg className="pspray-marks" viewBox={VIEW_BOX} role="img" aria-label={say("spray.hrAria", { name, n: fmt(lanes.total) })}>
                      {bubbles.map((b) => (
                        <g key={b.zone}>
                          <circle cx={b.x} cy={b.y} r={b.r} fill="#e0289c" fillOpacity={0.88} />
                          {b.r >= 6.5 ? <text x={b.x} y={b.y} className="pspray-count" style={{ fontSize: Math.min(13, b.r * 0.95) }}>{fmt(b.n)}</text> : null}
                        </g>
                      ))}
                    </svg>
                  </div>
                  <p className="note pspray-hr">{lanes.total ? say("spray.hrLine", { n: fmt(lanes.total), left: fmt(lanes.left), leftCentre: fmt(lanes.leftCentre), centre: fmt(lanes.centre), rightCentre: fmt(lanes.rightCentre), right: fmt(lanes.right) }) : say("spray.hrNone")}</p>
                  <p className="note">{say("spray.hrNote")}</p>
                </figure>
              </div>
              <div className="pspray-grid">
                <div className="pspray-bars">
                  <h3 className="psub">{say("spray.dirHead")}</h3>
                  <div className="pspray-split" role="img" aria-label={SIDES.map((s) => `${say(s.phrase)} ${pct(sum.sides[s.side] / Math.max(1, total))}`).join(", ")}>
                    {SIDES.map((s) => <i key={s.side} data-side={s.side} style={{ flexGrow: sum.sides[s.side] }} />)}
                  </div>
                  <ul className="pspray-legend">
                    {SIDES.map((s) => (
                      <li key={s.side}><i data-side={s.side} aria-hidden="true" />{say(s.phrase)} <b>{pct(sum.sides[s.side] / Math.max(1, total))}</b><span className="n">{fmt(sum.sides[s.side])}</span></li>
                    ))}
                  </ul>
                  <p className="note">{say(role === "pit" ? "spray.dirNotePit" : "spray.dirNoteBat", { name })}</p>
                </div>
                <div className="pspray-bars">
                  <h3 className="psub">{say("spray.typesHead")}</h3>
                  <ul className="pspray-types">
                    {types.map((t) => (
                      <li key={t.key}>
                        <span className="tn">{say(`spray.type${t.key}` as "spray.typeG")}</span>
                        <span className="tb" aria-hidden="true"><i style={{ width: `${(100 * t.n) / Math.max(1, typeTotal)}%` }} /></span>
                        <span className="tv"><b>{pct(t.n / Math.max(1, typeTotal))}</b><span className="n">{fmt(t.n)}</span></span>
                      </li>
                    ))}
                  </ul>
                  <p className="note">{say("spray.typesNote")}</p>
                </div>
              </div>
            </>
          )}
          <p className="note">{say("spray.zones")}</p>
          <p className="note">{say("spray.scope")}{partial ? ` ${say("spray.partial")}` : ""}{" "}<Rich text={say("spray.credit")} parts={{ retrosheet: <a href="https://www.retrosheet.org" target="_blank" rel="noopener noreferrer">Retrosheet</a> }} /></p>
        </>
      ) : null}
    </section>
  );
}
