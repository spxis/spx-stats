"use client";

import type { ReactNode } from "react";
import { DictionaryContext } from "@/lib/i18n/dictionaryContext";
import { JA } from "@/lib/i18n/dictionaries/ja.constants";

/** Holds the Japanese words; loaded as a chunk of its own, only for a reader in that language (see LocaleProvider). */
export default function JaDictionary({ children }: { children: ReactNode }) {
  return <DictionaryContext.Provider value={JA}>{children}</DictionaryContext.Provider>;
}
