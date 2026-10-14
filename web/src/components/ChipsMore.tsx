"use client";

import { useId, useState, type ReactNode } from "react";
import { useCountryFocus } from "./CountryScope";

/**
 * The "More countries (n)" button at the end of a row of chips: it opens the rest of the chips on their own line below. The chips are links the
 * server drew, so the row works as plain links once opened, and the button is the only part that needs the browser.
 */
export function ChipsMore({ label, children }: { label: string; children: ReactNode }) {
  const scope = useCountryFocus();
  const [own, setOwn] = useState(false);
  // Inside a CountryScope the donut's "Other countries" opens this list too, so the scope holds the state.
  const open = scope.hasMore ? scope.moreOpen : own;
  const setOpen = scope.hasMore ? scope.setMoreOpen : setOwn;
  const id = useId();
  return (
    <>
      <button type="button" className="pmore" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{label}</button>
      <div className="pchips pmore-list" id={id} hidden={!open}>{children}</div>
    </>
  );
}
