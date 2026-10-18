"use client";

import { useEffect, useState, type ReactNode } from "react";

/** The secondary filters: always shown on a wide screen, behind a Filters button on a phone. */
export function FilterFold({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  const [shut, setShut] = useState(false);
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 700px)");
    const apply = () => { setPhone(m.matches); setShut(m.matches && count === 0); };
    apply();
    m.addEventListener("change", apply);
    return () => m.removeEventListener("change", apply);
  }, [count]);
  return (
    <>
      {phone ? <button type="button" className="pf-toggle" aria-expanded={!shut} onClick={() => setShut(!shut)}>{label}{count ? ` (${count})` : ""}</button> : null}
      <div className="pf-body" hidden={shut}>{children}</div>
    </>
  );
}
