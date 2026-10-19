"use client";

import { useSyncExternalStore } from "react";
import { playedScoreMissing } from "@/lib/playedLate";
import Link from "./Link";
import { useSpeaker } from "./i18n/LocaleProvider";
import { StartTime } from "./StartTime";

const never = () => () => {};

/** Whether the reader's clock says the game was played (lib/playedLate.ts). The server and the first browser render say no, so nothing mismatches. */
function useScoreMissing(status: string, startsAt: string | null | undefined, gameDate: string): boolean {
  return useSyncExternalStore(
    never,
    () => playedScoreMissing({ status, startsAt, gameDate }, Date.now()),
    () => false,
  );
}

/**
 * The state of a game with no result, as the page would draw it (`text`), until the browser sees that the game was played; then
 * "Played · score to come" (`long`) or "Score to come" (`short`).
 */
export function GameState({ text, status, startsAt, gameDate, form = "short", help = false }: {
  text: string; status: string; startsAt?: string | null; gameDate: string; form?: "short" | "long"; help?: boolean;
}) {
  const { say } = useSpeaker();
  const missing = useScoreMissing(status, startsAt, gameDate);
  if (!missing) return <>{text}</>;
  const label = say(form === "long" ? "game.playedToCome" : "game.scoreToCome");
  return help ? <Link href="/help-wikipedia" title={say("wiki.linkTitle")}>{label}</Link> : <>{label}</>;
}

/** A scoreboard card's state and scheduled start. Once the game was played the start goes and the long wording shrinks to the short on a narrow card. */
export function PendingState({ text, status, startsAt, gameDate, startTitle, withTime }: {
  text: string; status: string; startsAt?: string | null; gameDate: string; startTitle: string; withTime: boolean;
}) {
  const { say } = useSpeaker();
  const missing = useScoreMissing(status, startsAt, gameDate);
  return (
    <>
      <span className="sstate pending">
        {missing ? (
          <>
            <Link href="/help-wikipedia" className="slong" title={say("wiki.linkTitle")}>{say("game.playedToCome")}</Link>
            <Link href="/help-wikipedia" className="sshort" title={say("wiki.linkTitle")}>{say("game.scoreToCome")}</Link>
          </>
        ) : text}
      </span>
      {withTime && !missing && startsAt ? (
        <span className="stime" title={startTitle}><StartTime iso={startsAt} gameDate={gameDate} /></span>
      ) : null}
    </>
  );
}
