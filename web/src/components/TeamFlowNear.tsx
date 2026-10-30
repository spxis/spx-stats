"use client";

import { useSpeaker } from "./i18n/LocaleProvider";
import { SankeyView } from "./SankeyView";
import { useFetchedJson } from "./useFetchedJson";
import { useSeen } from "./useSeen";
import type { FlowAnswer } from "@/lib/teamFlowView";
import "./sankey.css";

/**
 * Where a club's players of one season came from and went: the section's heading is in the page, and the diagram (about 45 KB of blocks, bands and player links)
 * is fetched from the club season's `rows/flow` when the reader gets near it, so the page itself does not carry it.
 */
export function TeamFlowNear({ dataHref }: { dataHref: string }) {
  const { say } = useSpeaker();
  const [ref, seen] = useSeen<HTMLElement>();
  const { state, data } = useFetchedJson<FlowAnswer>(dataHref, "flow", seen);
  return (
    <section className="section" id="flow" ref={ref}>
      <h2>{say("flow.title")}</h2>
      {data?.note ? <p className="note">{data.note}</p> : null}
      {data?.chart ? (
        <>
          <p className="note">{data.chart.lede}</p>
          <SankeyView
            nodes={data.chart.nodes} links={data.chart.links} routes={data.chart.routes} columnTitles={data.chart.columnTitles} unitPx={12} minPitch={150} panel
            hint={data.chart.hint} aria={data.chart.aria}
          />
          {data.chart.foot.map((t, i) => <p key={i} className="sk-note">{t}</p>)}
        </>
      ) : null}
      {!data ? (
        state === "failed" || state === "empty"
          ? <p className="note">{say("load.failed")}</p>
          : <div className="sk-skeleton" role="status">{say("sankey.loading")}</div>
      ) : null}
    </section>
  );
}
