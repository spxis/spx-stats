"use client";

import dynamic from "next/dynamic";
import { useState, useSyncExternalStore } from "react";
import { useSpeaker } from "./i18n/LocaleProvider";
import "./fieldplays.css";

/** The replay itself is code that loads only when Play is pressed, with the game's data (a small kept JSON file): the page carries this button and nothing else. */
const FieldPlayer = dynamic(() => import("./FieldPlayer"), {
  ssr: false,
  loading: () => <Loading />,
});

const subscribeNever = () => () => undefined;

function Loading() {
  const { say } = useSpeaker();
  return <div className="fpp"><p className="note" role="status">{say("fp.playLoading")}</p></div>;
}

/**
 * The Play button under a game's field (FieldPlays.tsx). Pressed, it loads the replay and the game's data and plays the game on the drawing above it: an MLB game's
 * balls flying to their zones inning by inning, an NFL game's drives play by play. Nothing plays by itself: the replay starts only from this press, or, for a reader
 * who prefers reduced motion, steps through the innings or quarters as still frames. `src` is the kept JSON file of the game's plays.
 */
export function FieldPlay({ sport, src }: { sport: "mlb" | "nfl"; src: string }) {
  const { say } = useSpeaker();
  const [open, setOpen] = useState(false);
  // The button is drawn once the page is live: without script it would do nothing.
  const live = useSyncExternalStore(subscribeNever, () => true, () => false);
  if (open) return <FieldPlayer sport={sport} src={src} onClose={() => setOpen(false)} />;
  return (
    <div className="fpp fpp-start">
      {live ? (
        <button type="button" className="fpp-btn fpp-main" onClick={() => setOpen(true)}>
          <i className="fpp-icon" data-icon="play" aria-hidden="true" />{say("fp.play")}
        </button>
      ) : null}
    </div>
  );
}
