"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * The "More countries (n)" button at the end of a row of chips: it opens the rest of the chips on their own line below. The chips are links the
 * server drew, so the row works as plain links once opened, and the button is the only part that needs the browser.
 */
export function ChipsMore({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button type="button" className="pmore" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>{label}</button>
      <div className="pchips pmore-list" id={id} hidden={!open}>{children}</div>
    </>
  );
}
