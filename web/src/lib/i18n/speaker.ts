import type { Locale } from "@/lib/locale";
import { DICTIONARIES } from "./dictionaries";
import { speakerWith, type Speaker } from "./i18n";

/** The site talking to a reader in `locale`, for server code. Not for a Client Component: this holds every language (use `useSpeaker()`). */
export function speaker(locale: Locale): Speaker {
  return speakerWith(locale, DICTIONARIES[locale]);
}
