/* The browser side of a banner trophy: draws a league's trophy at an angle, turns it slowly by itself, and lets the reader turn it. Loaded by TurnTrophy
   once the banner is in view; the page without it still shows the still the server drew (trophiesMetal.generated.ts).

   This does what bindTurn from @johnmorrisdotca/dougu-sports/turn does (drag, arrow keys, Home, Space, an auto-turn that waits for the reader and for
   reduced motion) for one emblem. bindTurn itself is not used because its module imports the registry of every emblem: 81 kB gzipped, against 7 kB
   for the one trophy and the lathe renderer drawn here. */
import { TROPHY_EMBLEM_LOADERS, TROPHY_SPEED, TROPHY_TILT, type TurnLeague } from "./trophyTurn";

const SENSITIVITY = 1.5; // degrees of turn for each pixel dragged
const KEY_STEP = 5; // degrees an arrow key turns (three times as much with Shift)
const PITCH_RANGE = [-60, 60] as const;
const TURNED_AT_LEAST = 0.5; // degrees: a smaller change is not drawn again

const wrap = (a: number): number => {
  const t = ((a % 360) + 360) % 360;
  return t > 180 ? t - 360 : t;
};
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Draws the league's trophy into `el` and turns it. Resolves to a function that stops everything and takes back the attributes it added.
 * `hint` is the sentence that tells a screen reader how to turn it, in the reader's language.
 */
export async function turnCup(el: HTMLElement, league: TurnLeague, hint: string): Promise<() => void> {
  const emblem = await TROPHY_EMBLEM_LOADERS[league]();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  let yaw = 0;
  let pitch = TROPHY_TILT;
  let drawnYaw = 0;
  let playing = !reduce.matches;
  let visible = false;
  let held = false;
  let last: number | undefined;
  let frame: number | undefined;
  let paint: number | undefined;
  let drag: { id: number; x: number; y: number } | undefined;
  let gone = false;

  const draw = () => {
    drawnYaw = yaw;
    el.innerHTML = emblem.frame({ style: "metal", size: 64, yaw, pitch, title: false }).replace(' width="64" height="64"', "");
  };
  /** One drawing for any number of pointer moves within a frame. */
  const schedule = () => {
    if (paint === undefined && !gone) paint = requestAnimationFrame(() => { paint = undefined; draw(); });
  };

  const running = () => playing && visible && !held && !document.hidden && !gone;
  const tick = (time: number) => {
    frame = undefined;
    if (!running()) { last = undefined; return; }
    const dt = last === undefined ? 0 : clamp((time - last) / 1000, 0, 0.1);
    last = time;
    if (dt > 0) {
      yaw = wrap(yaw + TROPHY_SPEED * dt);
      if (Math.abs(wrap(yaw - drawnYaw)) >= TURNED_AT_LEAST) draw();
    }
    frame = requestAnimationFrame(tick);
  };
  /** Starts or stops the frame loop to match the conditions: off screen, in a hidden tab, held by a pointer or paused, it asks for no frames. */
  const sync = () => {
    if (running()) { if (frame === undefined) frame = requestAnimationFrame(tick); return; }
    if (frame !== undefined) { cancelAnimationFrame(frame); frame = undefined; }
    last = undefined;
  };

  const down = (e: PointerEvent) => {
    if (e.button !== 0 || e.isPrimary === false) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    el.setPointerCapture?.(e.pointerId);
    el.style.cursor = "grabbing";
    held = true;
    sync();
  };
  const move = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = (e.clientX - drag.x) * SENSITIVITY;
    const dy = (e.clientY - drag.y) * SENSITIVITY;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (dx === 0 && dy === 0) return;
    yaw = wrap(yaw + dx);
    pitch = clamp(pitch - dy, PITCH_RANGE[0], PITCH_RANGE[1]);
    schedule();
  };
  const up = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    el.releasePointerCapture?.(e.pointerId);
    drag = undefined;
    held = false;
    el.style.cursor = "grab";
    sync();
  };
  const key = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const step = e.shiftKey ? KEY_STEP * 3 : KEY_STEP;
    if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); playing = !playing; sync(); return; }
    if (e.key === "ArrowLeft") yaw = wrap(yaw - step);
    else if (e.key === "ArrowRight") yaw = wrap(yaw + step);
    else if (e.key === "ArrowUp") pitch = clamp(pitch + step, PITCH_RANGE[0], PITCH_RANGE[1]);
    else if (e.key === "ArrowDown") pitch = clamp(pitch - step, PITCH_RANGE[0], PITCH_RANGE[1]);
    else if (e.key === "Home" || e.key === "0") { yaw = 0; pitch = TROPHY_TILT; }
    else return;
    e.preventDefault();
    playing = false; // a key takes over from the auto-turn; Space starts it again
    sync();
    schedule();
  };
  const hiddenChanged = () => sync();
  const motionChanged = () => { if (reduce.matches) playing = false; sync(); };

  const watcher = new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1]?.isIntersecting ?? false;
    sync();
  });

  const saved = { tabindex: el.getAttribute("tabindex"), description: el.getAttribute("aria-description"), touchAction: el.style.touchAction, userSelect: el.style.userSelect, cursor: el.style.cursor };
  el.setAttribute("tabindex", "0");
  el.setAttribute("aria-description", hint);
  // pan-y: a finger moving up or down still scrolls the page; sideways turns the trophy. A mouse or pen also tilts it.
  el.style.touchAction = "pan-y";
  el.style.userSelect = "none";
  el.style.cursor = "grab";
  const listeners: [string, EventListener][] = [
    ["pointerdown", down as EventListener], ["pointermove", move as EventListener], ["pointerup", up as EventListener],
    ["pointercancel", up as EventListener], ["lostpointercapture", up as EventListener], ["keydown", key as EventListener],
  ];
  for (const [type, fn] of listeners) el.addEventListener(type, fn);
  document.addEventListener("visibilitychange", hiddenChanged);
  reduce.addEventListener("change", motionChanged);
  watcher.observe(el);

  return () => {
    gone = true;
    watcher.disconnect();
    document.removeEventListener("visibilitychange", hiddenChanged);
    reduce.removeEventListener("change", motionChanged);
    for (const [type, fn] of listeners) el.removeEventListener(type, fn);
    if (frame !== undefined) cancelAnimationFrame(frame);
    if (paint !== undefined) cancelAnimationFrame(paint);
    const put = (name: string, value: string | null) => (value === null ? el.removeAttribute(name) : el.setAttribute(name, value));
    put("tabindex", saved.tabindex);
    put("aria-description", saved.description);
    el.style.touchAction = saved.touchAction;
    el.style.userSelect = saved.userSelect;
    el.style.cursor = saved.cursor;
  };
}
