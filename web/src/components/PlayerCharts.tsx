"use client";

import { useState } from "react";
import { metricOf, type Metric } from "@/lib/playerBoard";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import { useSpeaker } from "./i18n/LocaleProvider";
import { PlayerBars } from "./PlayerBars";
import { PlayerDonuts } from "./PlayerDonuts";
import { PlayerProgress } from "./PlayerProgress";
import { PlayerRadar } from "./PlayerRadar";
import type { BoardView } from "./playerView";

/** The charts of the seasons chosen: bars by season with a per-game line, shares, the career line with its milestones, and the league radar. */
export default function PlayerCharts({ view }: { view: BoardView }) {
  const { say } = useSpeaker();
  const [gid, setGid] = useState(view.groups[0]?.def.id ?? "");
  const [picked, setPicked] = useState<Record<string, string>>({});
  const g = view.groups.find((x) => x.def.id === gid) ?? view.groups[0];
  if (!g || !g.rows.length) return null;
  const metric: Metric = metricOf(g.def, picked[g.def.id] ?? g.def.bars[0]);
  const choose = (id: string) => setPicked((p) => ({ ...p, [g.def.id]: id }));
  return (
    <div className="pcharts">
      {view.groups.length > 1 ? (
        <div className="seg scroll" role="group" aria-label={say("board.groupAria")}>
          {view.groups.map((x) => <button key={x.def.id} type="button" aria-pressed={x.def.id === g.def.id} onClick={() => setGid(x.def.id)}>{say(x.def.title as PhraseKey)}</button>)}
        </div>
      ) : null}
      <div className="seg scroll pstats" role="group" aria-label={say("board.statAria")}>
        {g.def.bars.map((id) => {
          const m = metricOf(g.def, id);
          return <button key={id} type="button" title={say(m.title as PhraseKey)} aria-pressed={id === metric.id} onClick={() => choose(id)}>{say(m.label as PhraseKey)}</button>;
        })}
      </div>
      <PlayerBars view={view} g={g} metric={metric} />
      <PlayerProgress view={view} g={g} metric={metric} />
      <PlayerDonuts view={view} g={g} metric={metric} />
      <PlayerRadar view={view} g={g} />
    </div>
  );
}
