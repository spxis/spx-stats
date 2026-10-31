"use client";

import dynamic from "next/dynamic";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { DictionaryContext } from "@/lib/i18n/dictionaryContext";
import { speakerWith, type Speaker } from "@/lib/i18n/i18n";
import { DEFAULT_LOCALE, type Locale } from "@/lib/locale";

/**
 * The reader's language, carried to the parts of the site drawn in the browser. Set once, in the root layout,
 * from the same `currentLocale()` the server rendered the page with, so the markup the server sends and the
 * markup React hydrates agree by construction.
 *
 * The browser gets the words of one language only: the English catalogue is always there (it is the fallback for a
 * missing key), and French or Japanese is a chunk of its own, fetched only when the page is in that language (Next
 * preloads it with the page, so it arrives beside the other scripts). Without this every page carried all three.
 */
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

const FrDictionary = dynamic(() => import("./FrDictionary"));
const JaDictionary = dynamic(() => import("./JaDictionary"));

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const inner = <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
  if (locale === "fr") return <FrDictionary>{inner}</FrDictionary>;
  if (locale === "ja") return <JaDictionary>{inner}</JaDictionary>;
  return inner;
}

/** The twin of `currentSpeaker()` for a Client Component. Outside a provider it answers in English. */
export function useSpeaker(): Speaker {
  const locale = useContext(LocaleContext);
  const dictionary = useContext(DictionaryContext);
  return useMemo(() => speakerWith(locale, dictionary), [locale, dictionary]);
}
