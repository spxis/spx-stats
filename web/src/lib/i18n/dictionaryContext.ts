import { createContext } from "react";
import type { Dictionary } from "./dictionaries";
import { PHRASES } from "./phrases.constants";

/** The reader's language as the browser holds it: English until a language's chunk (components/i18n/FrDictionary, JaDictionary) wraps the page. */
export const DictionaryContext = createContext<Dictionary>(PHRASES);
