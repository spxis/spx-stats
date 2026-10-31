"use client";

import type { ReactNode } from "react";
import { DictionaryContext } from "@/lib/i18n/dictionaryContext";
import { FR } from "@/lib/i18n/dictionaries/fr.constants";

/** Holds the French words; loaded as a chunk of its own, only for a reader in that language (see LocaleProvider). */
export default function FrDictionary({ children }: { children: ReactNode }) {
  return <DictionaryContext.Provider value={FR}>{children}</DictionaryContext.Provider>;
}
