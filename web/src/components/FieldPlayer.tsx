"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { mlbStage, nflStage, type Stage } from "@/lib/fieldPlayStage";
import { mlbFrame, mlbTimeline, nflFrame, nflTimeline, type PlayWire } from "@/lib/playTimeline";
import { useSpeaker } from "./i18n/LocaleProvider";
import { useFetchedJson } from "./useFetchedJson";
import "./fieldplays.css";

const SPEEDS = [0.5, 1, 2, 4] as const;
const QUERY = "(prefers-reduced-motion: reduce)";
const reducedNow = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
function watchReduced(on: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const q = window.matchMedia(QUERY);
  q.addEventListener("change", on);
  return () => q.removeEventListener("change", on);
}

interface View { label: string; lines: [string, string]; final: string; chip: number | null; caption: string; done: boolean; broken: boolean; next: number | null }

/**
 * The replay of a game on its field. Loaded when Play is pressed (FieldPlay.tsx): it fetches the game's plays as one kept JSON file and then moves the marks of the
 * drawing above it, in the browser, one animation frame at a time; the server is not asked for anything while it plays. See lib/playTimeline.ts for the clock and
 * lib/fieldPlayStage.ts for how the drawing is moved.
 */
export default function FieldPlayer({ sport, src, onClose }: { sport: "mlb" | "nfl"; src: string; onClose: () => void }) {
  const { say } = useSpeaker();
  const { state, data } = useFetchedJson<PlayWire>(src, "plays", true);
  if (state === "failed" || state === "empty" || (state === "done" && data?.sport !== sport)) {
    return (
      <div className="fpp">
        <p className="note" role="status">{say("fp.playFailed")}</p>
        <button type="button" className="fpp-btn" onClick={onClose}>{say("fp.close")}</button>
      </div>
    );
  }
  if (!data) return <div className="fpp"><p className="note" role="status">{say("fp.playLoading")}</p></div>;
  return <Replay wire={data} onClose={onClose} />;
}

function Replay({ wire, onClose }: { wire: PlayWire; onClose: () => void }) {
  const { say, fmt } = useSpeaker();
  const mlb = wire.sport === "mlb";
  const mtl = useMemo(() => (wire.sport === "mlb" ? mlbTimeline(wire.balls) : null), [wire]);
  const ntl = useMemo(() => (wire.sport === "nfl" ? nflTimeline(wire.drives, wire.score) : null), [wire]);
  const total = (mtl ?? ntl)!.total;
  const chips = mtl ? mtl.chips.map((c) => ({ key: c.inning, t: c.t })) : ntl!.chips.map((c) => ({ key: c.qtr, t: c.t }));
  const steps = mtl ? mtl.steps : ntl!.steps;
  const reduced = useSyncExternalStore(watchReduced, reducedNow, () => false);
  const reducedRef = useRef(reduced);
  const box = useRef<HTMLDivElement>(null);
  const range = useRef<HTMLInputElement>(null);
  const eng = useRef({ t: 0, playing: false, speed: 1, raf: 0, last: 0, stages: new Map<SVGSVGElement, Stage | null>() });
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [view, setView] = useState<View>({ label: "", lines: ["", ""], final: "", chip: null, caption: "", done: false, broken: false, next: null });
  const sig = useRef("");

  const render = useCallback((t: number) => {
    const s = eng.current;
    s.t = t;
    const snap = reducedRef.current;
    const mf = mtl ? mlbFrame(mtl, t, snap) : null;
    const nf = ntl && wire.sport === "nfl" ? nflFrame(ntl, wire.drives, t, wire.score, snap) : null;
    const frame = (mf ?? nf)!;
    let caption = "", live = 0, broken = 0;
    const figure = box.current?.closest("figure");
    figure?.querySelectorAll<SVGSVGElement>(".fplay-art > svg.kyogijo").forEach((svg) => {
      let st = s.stages.get(svg);
      if (st === undefined) {
        st = wire.sport === "mlb" ? mlbStage(svg, wire) : nflStage(svg, wire);
        s.stages.set(svg, st);
      }
      if (!st) { broken++; return; }
      live++;
      st.apply(frame);
      if (!caption) caption = st.titleOf(frame);
    });
    if (range.current) range.current.value = String(Math.round(t));
    let v: View;
    const next = steps.find((x) => x > t + 0.5) ?? null;
    if (mf && mtl && wire.sport === "mlb") {
      const blk = mtl.blocks[mf.block];
      const side = (i: 0 | 1) => say("fp.mlbTeam", { team: wire.teams[i].name, hits: fmt(mf.tally[i].hits), hr: fmt(mf.tally[i].hr), outs: fmt(mf.tally[i].outs) });
      const [a, h] = wire.score;
      v = {
        label: blk ? say(blk.half ? "fp.ballBottom" : "fp.ballTop", { inning: blk.inning }) : "",
        lines: [side(0), side(1)],
        final: mf.done && a != null && h != null ? say("fp.mlbFinal", { away: wire.teams[0].name, awayScore: fmt(a), home: wire.teams[1].name, homeScore: fmt(h) }) : "",
        chip: blk?.inning ?? null, caption, done: mf.done, broken: live === 0 && broken > 0, next,
      };
    } else {
      const q = nf!.qtr ?? (wire.sport === "nfl" ? wire.drives[0]?.qtr ?? null : null);
      const side = (i: 0 | 1) => say("fp.nflScore", { team: wire.teams[i].name, score: fmt(nf!.score[i]) });
      v = {
        label: q == null ? "" : q > 4 ? say("fp.overtime") : say("fp.quarter", { n: q }),
        lines: [side(0), side(1)], final: "", chip: q, caption, done: nf!.done, broken: live === 0 && broken > 0, next,
      };
    }
    const key = JSON.stringify(v);
    if (key !== sig.current) { sig.current = key; setView(v); }
  }, [mtl, ntl, wire, steps, say, fmt]);

  const pause = useCallback(() => {
    const s = eng.current;
    s.playing = false;
    cancelAnimationFrame(s.raf);
    setPlaying(false);
  }, []);

  const play = useCallback(() => {
    const s = eng.current;
    if (s.playing) return;
    if (s.t >= total) render(0);
    s.playing = true;
    s.last = performance.now();
    setPlaying(true);
    const loop = (now: number) => {
      if (!s.playing) return;
      s.raf = requestAnimationFrame(loop);
      const dt = Math.min(100, now - s.last);
      s.last = now;
      const t = Math.min(total, s.t + dt * s.speed);
      render(t);
      if (t >= total) pause();
    };
    s.raf = requestAnimationFrame(loop);
  }, [total, render, pause]);

  // Start at the first frame; play now unless the reader prefers reduced motion (the press that opened the replay is the only start there is).
  useEffect(() => {
    reducedRef.current = reduced;
    const s = eng.current;
    render(s.t);
    if (reduced) { s.playing = false; cancelAnimationFrame(s.raf); }
  }, [reduced, render]);
  useEffect(() => {
    if (!reducedRef.current) play();
    const s = eng.current;
    const stop = () => { if (document.hidden) pause(); };
    document.addEventListener("visibilitychange", stop);
    const figure0 = box.current?.closest("figure");
    figure0?.setAttribute("data-play", "1");
    // The drawing is a file that arrives when it comes into view: when it appears (or the other of a football field's two arrives), show the game on it at once.
    const figure = box.current?.closest("figure");
    const watch = figure && typeof MutationObserver !== "undefined" ? new MutationObserver(() => { if (!s.playing) render(s.t); }) : null;
    if (figure) watch?.observe(figure, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("visibilitychange", stop);
      figure0?.removeAttribute("data-play");
      watch?.disconnect();
      cancelAnimationFrame(s.raf);
      s.playing = false;
      s.stages.forEach((st) => st?.reset());
      s.stages.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seek = (t: number) => render(Math.min(total, Math.max(0, t)));
  const nextStep = view.next;
  const stepWord = mlb ? "fp.stepInning" : "fp.stepQuarter";
  const main = () => {
    if (reduced) { if (nextStep != null) seek(nextStep); else seek(0); return; }
    if (running) pause(); else play();
  };
  const running = playing && !reduced;
  const mainText = reduced ? say(nextStep != null ? stepWord : "fp.startOver") : running ? say("fp.pause") : view.done ? say("fp.replay") : say("fp.resume");
  const icon = reduced ? "step" : running ? "pause" : "play";
  const swatch = (i: 0 | 1) => ({ "--tc": `#${wire.teams[i].color}` }) as React.CSSProperties;
  const chipText = (k: number) => (mlb ? String(k) : k > 4 ? say("fp.overtime") : say("fp.quarter", { n: k }));
  const chipAria = (k: number) => (mlb ? say("fp.jumpInning", { n: k }) : k > 4 ? say("fp.jumpOvertime") : say("fp.jumpQuarter", { n: k }));

  return (
    <div className="fpp fpp-open" ref={box}>
      <div className="fpp-bar" role="group" aria-label={say("fp.play")}>
        <div className="fpp-status">
          <b className="fpp-when">{view.label}</b>
          <ul className="fplay-teams fpp-teams">
            {([0, 1] as const).map((i) => <li key={i} style={swatch(i)}><i className="ft" aria-hidden="true" />{view.lines[i]}</li>)}
          </ul>
        </div>
        {view.final ? <p className="fpp-final">{view.final}</p> : null}
        <p className="fpp-caption" aria-hidden="true">{view.caption}</p>
        {view.broken ? <p className="note">{say("fp.playNoStage")}</p> : null}
        <div className="fpp-row">
          <button type="button" className="fpp-btn fpp-main" onClick={main} disabled={view.broken}>
            <i className="fpp-icon" data-icon={icon} aria-hidden="true" />{mainText}
          </button>
          {reduced ? null : (
            <div className="fpp-speeds" role="group" aria-label={say("fp.speedAria")}>
              {SPEEDS.map((v) => (
                <button key={v} type="button" className="fpp-btn" aria-pressed={speed === v} aria-label={say("fp.speedTimes", { n: fmt(v) })}
                  onClick={() => { eng.current.speed = v; setSpeed(v); }}>{fmt(v)}×</button>
              ))}
            </div>
          )}
        </div>
        <input ref={range} type="range" className="fpp-scrub" min={0} max={Math.round(total)} step={1} defaultValue={0} aria-label={say("fp.scrubAria")} aria-valuetext={view.label}
          onChange={(e) => seek(Number(e.currentTarget.value))} disabled={view.broken} />
      </div>
      <div className="fpp-chips" role="group" aria-label={say("fp.jumpAria")}>
          {chips.map((c) => (
            <button key={c.key} type="button" className="fpp-btn fpp-chip" aria-pressed={view.chip === c.key} aria-label={chipAria(c.key)} onClick={() => seek(c.t)}>{chipText(c.key)}</button>
          ))}
      </div>
      <p className="note fpp-note">{mlb ? say("fp.mlbPlayNote") : say("fp.nflPlayNote")}</p>
      <button type="button" className="fpp-btn fpp-close" onClick={onClose}>{say("fp.close")}</button>
      <p className="fpp-sr" role="status" aria-live="polite">{view.label}</p>
    </div>
  );
}
