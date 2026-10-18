"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useSpeaker } from "./i18n/LocaleProvider";

/* The cups a client component may draw, as markup the server drew (lib/cups.ts) and sent as data: no drawing code is in the browser bundle. */
const Cups = createContext<Record<string, string>>({});

/** Wraps a client component that draws `MiniCup`s: the page names the leagues it shows (`cupsFor(leagues)` of lib/cups.ts) and the server draws their cups once. */
export function CupsProvider({ markup, children }: { markup: Record<string, string>; children: ReactNode }) {
  return <Cups value={markup}>{children}</Cups>;
}

/** A small cup beside an award winner: the league's line cup from the table's CupSprite, decorative (the winner's name is the text). */
export function AwardCup({ league }: { league: string }) {
  return <svg className="awardcup" aria-hidden="true" focusable="false"><use href={`#cup-${league}`} /></svg>;
}

/** The small cup beside a championship season in a table or a list drawn in the browser (a cup is drawn on the server, in lib/cups.ts; TrophyMark has the ones a server page draws inline). It draws nothing for a league the provider was not given. */
export function MiniCup({ league }: { league: string }) {
  const { say } = useSpeaker();
  const markup = useContext(Cups)[league];
  if (!markup) return null;
  return <span className="minicup" title={say("trophy.champion")} role="img" aria-label={say("trophy.champion")} dangerouslySetInnerHTML={{ __html: markup }} />;
}
