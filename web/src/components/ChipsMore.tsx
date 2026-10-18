"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useCountryFocus } from "./CountryScope";

/**
 * The "More countries (n)" button at the end of a row of chips: it opens the rest of the chips on their own line below. The chips are links the
 * server drew, so the row works as plain links once opened, and the button is the only part that needs the browser. With `closeOnRow`, a click on
 * the row's own chip links (the All chip) shuts the list.
 */
export function ChipsMore({ label, children, closeOnRow = false }: { label: string; children: ReactNode; closeOnRow?: boolean }) {
  const scope = useCountryFocus();
  const [own, setOwn] = useState(false);
  // Inside a CountryScope the donut's "Other countries" opens this list too, so the scope holds the state.
  const open = scope.hasMore ? scope.moreOpen : own;
  const setOpen = scope.hasMore ? scope.setMoreOpen : setOwn;
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const row = button.current?.parentElement;
    if (!closeOnRow || !row) return;
    const shut = (e: Event) => {
      const link = (e.target as Element).closest("nav a");
      if (link && row.contains(link) && !link.closest(".pmore-list")) setOpen(false);
    };
    row.addEventListener("click", shut);
    return () => row.removeEventListener("click", shut);
  }, [closeOnRow, setOpen]);
  return (
    <>
      <button type="button" ref={button} className="pmore" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{label}</button>
      <div className="pchips pmore-list" id={id} hidden={!open}>{children}</div>
    </>
  );
}
