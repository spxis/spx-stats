"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isCountryCode } from "@/lib/countryFocus";

/** What the parts of a country section share: the country chosen (`?nat=`), the one under the pointer or focus, and the "more countries" list. */
export interface CountryFocus {
  /** True inside a CountryScope: parts outside one draw as they always did. */
  scoped: boolean;
  chosen: string | null;
  hover: string | null;
  /** Whether the scope has a row of chips with a "More countries" list the donut's "Other countries" can open. */
  hasMore: boolean;
  moreOpen: boolean;
  setMoreOpen: (open: boolean) => void;
  /** The page's accent colour as it is now (it changes with the league and the theme), for the parts that paint with it. */
  accent: () => string;
}

const FALLBACK_ACCENT = "#c8102e";
const OUTSIDE: CountryFocus = { scoped: false, chosen: null, hover: null, hasMore: false, moreOpen: false, setMoreOpen: () => {}, accent: () => FALLBACK_ACCENT };
const Ctx = createContext<CountryFocus>(OUTSIDE);
export const useCountryFocus = (): CountryFocus => useContext(Ctx);

/** The country a pointer or the focus is on: an element that names one (`data-country`, as chips, legend rows and donut slices do; `data-code` inside a Chizu map). */
function codeAt(target: EventTarget | null): { code: string | null; el: Element | null } {
  const el = target instanceof Element ? target.closest("[data-country], .chizu [data-code]") : null;
  if (!el) return { code: null, el: null };
  const code = el.getAttribute("data-country") ?? el.getAttribute("data-code");
  return { code: isCountryCode(code) ? code : null, el };
}

/**
 * Wraps a "Where the players come from" section so its parts answer to one country: hovering or focusing a chip, a legend row, a donut slice or a
 * country on the map highlights that country in all of them, and `chosen` (the `?nat=` of the address) stays highlighted. Nothing is fetched: it is the
 * browser telling its own parts which country the reader is on. The chips are drawn by the server, so they are marked here, with `data-hover` and
 * `data-chosen` on every `[data-country]` element; the donut and the map read the same state.
 */
export function CountryScope({ chosen, more = false, children }: { chosen?: string | null; more?: boolean; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const pick = isCountryCode(chosen) ? chosen : null;

  useEffect(() => {
    root.current?.querySelectorAll("[data-country]").forEach((el) => {
      const code = el.getAttribute("data-country");
      el.toggleAttribute("data-hover", code === hover);
      el.toggleAttribute("data-chosen", code === pick);
    });
  }, [hover, pick, moreOpen]);

  const accent = useCallback(() => {
    const raw = root.current ? getComputedStyle(root.current).getPropertyValue("--accent").trim() : "";
    return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\))$/i.test(raw) ? raw : FALLBACK_ACCENT;
  }, []);

  const value = useMemo<CountryFocus>(() => ({ scoped: true, chosen: pick, hover, hasMore: more, moreOpen, setMoreOpen, accent }), [pick, hover, more, moreOpen, accent]);
  const enter = (e: { target: EventTarget | null }) => { const { code } = codeAt(e.target); if (code) setHover(code); };
  const leave = (e: { target: EventTarget | null; relatedTarget: EventTarget | null }) => {
    const { code, el } = codeAt(e.target);
    if (code && !(e.relatedTarget instanceof Node && el?.contains(e.relatedTarget))) setHover((h) => (h === code ? null : h));
  };
  return (
    <Ctx.Provider value={value}>
      <div ref={root} className="cscope" onPointerOver={enter} onPointerOut={leave} onFocus={enter} onBlur={leave}
        onMouseLeave={() => setHover(null)}>
        {children}
      </div>
    </Ctx.Provider>
  );
}
