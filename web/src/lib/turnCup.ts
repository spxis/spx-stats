/* The browser side of a banner trophy: turns the cup the server drew. Loaded by TurnTrophy once the banner is in view; the page without it still shows the still
   (lib/cups.ts), which is the first frame of this turn.

   The turning is bindTurn of @johnmorrisdotca/dougu-sports/turn, given the one emblem (the package's own module for that cup), so the page carries the turning
   and the one cup and not the package's registry of every emblem. What the page adds to it is what a banner needs: it waits to be in view, it stops while it is off
   screen, a finger that moves up or down still scrolls the page, and the hint for a screen reader is the site's own, in the reader's language. */
import { bindTurn } from "@johnmorrisdotca/dougu-sports/turn";
import { TROPHY_EMBLEM_LOADERS, TROPHY_SPEED, TROPHY_TILT, type TurnLeague } from "./trophyTurn";

/**
 * Binds the league's trophy in `el`, which already holds its still, and starts it turning slowly. Resolves to a function that stops everything and takes back what was added.
 * `hint` is the sentence that tells a screen reader how to turn it. Under reduced motion it waits for the reader (a key or Space starts it).
 */
export async function turnCup(el: HTMLElement, league: TurnLeague, hint: string): Promise<() => void> {
  const emblem = await TROPHY_EMBLEM_LOADERS[league]();
  let visible = true;
  let wanted = true; // the reader has not stopped it
  let setting = false; // this file is starting or stopping it, not the reader
  const turner = bindTurn(el, emblem, {
    style: "metal", size: 64, title: false, pitch: TROPHY_TILT, speed: TROPHY_SPEED, autoPlay: true,
    onPlayChange: (playing) => { if (!setting) wanted = playing; },
  });
  wanted = turner.playing; // under reduced motion it starts paused, and stays so until the reader starts it
  // The page's words, not the package's: the hint in the reader's language, no role description, and a vertical drag that still scrolls the page (bindTurn gives them back on destroy).
  el.setAttribute("aria-description", hint);
  el.removeAttribute("aria-roledescription");
  el.style.touchAction = "pan-y";

  const sync = () => {
    setting = true;
    if (visible && wanted && !turner.playing) turner.play();
    else if ((!visible || !wanted) && turner.playing) turner.pause();
    setting = false;
  };
  const watcher = new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1]?.isIntersecting ?? false;
    sync();
  });
  watcher.observe(el);
  return () => {
    watcher.disconnect();
    turner.destroy();
  };
}
