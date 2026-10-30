"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { TeamLabel } from "./TeamLabel";

interface Known { names: Map<number, string>; logos: Map<string, string> }
const Context = createContext<Known>({ names: new Map(), logos: new Map() });

/**
 * The clubs a season-outage page names (a club is named some two hundred times on it: in the cards, the tables and the lists), told once: each club's name, and the logo it wore in
 * each of the two seasons. A club in the page is then a reference to `Tm` of about eighty bytes, not its logo, link and name drawn on the server and sent twice.
 */
export function OutageTeams({ lg, names, logos, children }: { lg: string; names: [number, string][]; logos: [number, number, string][]; children: ReactNode }) {
  const known = useMemo(() => ({ names: new Map(names), logos: new Map(logos.map(([f, y, url]) => [`${f}:${y}`, url])) }), [names, logos]);
  return <Context.Provider value={{ ...known }}><LgContext.Provider value={lg}>{children}</LgContext.Provider></Context.Provider>;
}

const LgContext = createContext("");

/** The names of the clubs the page names, by franchise (for a table that sorts by them). */
export const useOutageNames = (): ReadonlyMap<number, string> => useContext(Context).names;

/** A club named in a card, table or list: its logo and its name as a link to its page. `text` is the name when the page spells it differently (the name it had then). */
export function Tm({ f, y, text }: { f: number; y: number; text?: string }) {
  const known = useContext(Context);
  const lg = useContext(LgContext);
  return <span className="tm"><TeamLabel lg={lg} f={f} name={text ?? known.names.get(f) ?? ""} logo={known.logos.get(`${f}:${y}`) || null} /></span>;
}
