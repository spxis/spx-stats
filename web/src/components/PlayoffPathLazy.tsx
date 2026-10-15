"use client";

import type { SeasonPathView } from "@/lib/seasonPathData";
import { useSpeaker } from "./i18n/LocaleProvider";
import { PlayoffPath } from "./PlayoffPath";
import { useFetchedJson } from "./useFetchedJson";
import { useSeen } from "./useSeen";

/**
 * The playoff path diagram of a season, drawn when the reader gets near it: its data (a block for every club and series and the words of each) is one
 * kept JSON answer from the season's `rows/path` address, not part of the page.
 */
export function PlayoffPathLazy({ href }: { href: string }) {
  const { say } = useSpeaker();
  const [ref, seen] = useSeen<HTMLDivElement>("700px 0px");
  const { state, data } = useFetchedJson<SeasonPathView>(href, "view", seen);
  if (data) return <PlayoffPath {...data} />;
  return (
    <div ref={ref} style={{ minHeight: state === "failed" ? undefined : 620 }}>
      {state === "loading" ? <p className="note" role="status">{say("sankey.loading")}</p> : null}
      {state === "failed" ? <p className="note">{say("load.failed")}</p> : null}
    </div>
  );
}
