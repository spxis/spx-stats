"use client";

import { heroFigure, leagueFinishes, metricOf, topPercent, type GroupView, type Metric } from "@/lib/playerBoard";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import { showStat } from "@/lib/playerStats";
import { useSpeaker } from "./i18n/LocaleProvider";
import type { BoardView } from "./playerView";

/** Who a player is compared with: forwards, defensemen, or all of their kind. */
export function whoKey(group: string, bucket: string): PhraseKey {
  if (group === "skater") return bucket === "F" ? "who.F" : bucket === "D" ? "who.D" : "who.skater";
  return `who.${group}` as PhraseKey;
}

/** The big numbers of the seasons chosen, for each stat group the player has: totals, per-game rates, where the player stands among the league's players, and finishes at the top of the league. */
export function PlayerHero({ view }: { view: BoardView }) {
  const { say } = useSpeaker();
  return (
    <div className="phero">
      {view.groups.map((g) => (
        <div key={g.def.id} className="hgroup">
          {view.groups.length > 1 ? <h3>{say(g.def.title as PhraseKey)}</h3> : null}
          {g.rows.length ? <Cards view={view} g={g} /> : <p className="note">{say("board.noneInRange")}</p>}
        </div>
      ))}
    </div>
  );
}

function Cards({ view, g }: { view: BoardView; g: GroupView }) {
  const { say, fmt, plural } = useSpeaker();
  const { def } = g;
  const phase = view.state.phase;
  const who = say(whoKey(def.id, view.data.bucket));
  return (
    <div className="hcards">
      {def.hero.map((h) => {
        const m: Metric = metricOf(def, h.id);
        if (h.record) {
          const w = g.total.w, l = g.total.l;
          if (w == null && l == null) return null;
          const share = w != null && l != null && w + l > 0 ? w / (w + l) : null;
          return (
            <div key={h.id} className="hcard" title={`${say("stat.w.name")} – ${say("stat.l.name")}`}>
              <span className="hl">{say("stat.w")}–{say("stat.l")}</span>
              <b className="hv">{fmt(w ?? 0)}–{fmt(l ?? 0)}</b>
              {share != null ? <span className="hs">{say("hero.winPct", { n: showStat("rate3", share, fmt) })}</span> : null}
            </div>
          );
        }
        const f = heroFigure(def, m, g.rows, view.refs, phase);
        if (f.value == null) return null;
        const pt = f.pct != null ? pctText(f.pct, who, say, fmt) : null;
        const finishes = m.sum && view.refs.size ? leagueFinishes(g.seasons, m, view.refs, def.id, phase) : null;
        return (
          <div key={h.id} className="hcard" title={say(m.title as PhraseKey)}>
            <span className="hl">{say(m.label as PhraseKey)}</span>
            <b className="hv">{showStat(m.kind, f.value, fmt)}</b>
            {f.per != null ? <span className="hs">{say(m.per!.unit === "nine" ? "hero.perNine" : "hero.perGame", { n: f.per.toFixed(2) })}</span> : null}
            {pt ? <span className="hp">{pt}</span> : null}
            {finishes && finishes.led > 0 ? <span className="hr">{plural("hero.led", finishes.led)}</span>
              : finishes && finishes.top10 > 0 ? <span className="hr">{plural("hero.top10", finishes.top10)}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

/** "Top 3% of forwards" for a strong figure, "Ahead of 40% of forwards" for the rest; nothing when it beats almost nobody. */
function pctText(p: number, who: string, say: (k: PhraseKey, v?: Record<string, string | number>) => string, fmt: (n: number) => string): string | null {
  if (p >= 0.75) return say("hero.top", { pct: fmt(topPercent(p)), who });
  const n = Math.round(p * 100);
  return n >= 1 ? say("hero.ahead", { pct: fmt(n), who }) : null;
}
