import type { Locale } from "@/lib/locale";
import { FR } from "./dictionaries/fr.constants";
import { JA } from "./dictionaries/ja.constants";
import { PHRASES, type PhraseKey } from "./phrases.constants";

export type Dictionary = Partial<Record<PhraseKey, string>>;

/** Each language's phrases. A key a dictionary lacks is read from the English catalogue. */
export const DICTIONARIES: Record<Locale, Dictionary> = { en: PHRASES, fr: FR, ja: JA };
