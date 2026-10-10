"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { speaker, type Speaker } from "@/lib/i18n/i18n";
import { DEFAULT_LOCALE, type Locale } from "@/lib/locale";

/**
 * The reader's language, carried to the parts of the site drawn in the browser. Set once, in the root layout,
 * from the same `currentLocale()` the server rendered the page with, so the markup the server sends and the
 * markup React hydrates agree by construction.
 */
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** The twin of `currentSpeaker()` for a Client Component. Outside a provider it answers in English. */
export function useSpeaker(): Speaker {
  const locale = useContext(LocaleContext);
  return useMemo(() => speaker(locale), [locale]);
}
