import { LOCALE_TAG, type Locale } from "@/lib/locale";
import type { Dictionary } from "./dictionaries";
import { formatsFor, type DateFormats } from "./formats";
import { PHRASES, type PhraseKey } from "./phrases.constants";

export type Vars = Readonly<Record<string, string | number>>;

/** The base of every `<base>.one` / `<base>.other` pair in the catalogue. */
export type PluralBase = PhraseKey extends infer K ? (K extends `${infer B}.one` ? B : never) : never;

/**
 * Fills `{placeholders}`. A name nobody supplied is left standing rather than blanked: an empty gap in a
 * sentence reads as prose, `{game}` on the page reads as the bug it is. (It is also how a phrase hands a
 * place for a link to `Rich`.)
 */
export function fill(template: string, vars?: Vars): string {
  if (vars === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));
}

/** The `{placeholders}` a phrase expects, in the order they appear. */
export function placeholdersIn(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string);
}

/** The site talking to one reader: their words, their numbers, their dates. */
export interface Speaker {
  locale: Locale;
  say(key: PhraseKey, vars?: Vars): string;
  /** `<base>.one` or `<base>.other`, by the language's own plural rule; `{count}` is filled with `n` formatted. */
  plural(base: PluralBase, n: number, vars?: Vars): string;
  fmt(n: number): string;
  dt: DateFormats;
}

/**
 * The site talking in one language, given that language's dictionary. A Client Component gets the dictionary from `LocaleProvider`, which
 * loads only the reader's language: this file must not import the other languages (`speaker()` in ./speaker.ts does, for the server).
 */
export function speakerWith(locale: Locale, dictionary: Dictionary): Speaker {
  const say = (key: PhraseKey, vars?: Vars) => fill(dictionary[key] ?? PHRASES[key], vars);
  const { fmt, dt } = formatsFor(locale);
  const rules = new Intl.PluralRules(LOCALE_TAG[locale]);
  return {
    locale,
    say,
    plural: (base, n, vars) => say(`${base}.${rules.select(n) === "one" ? "one" : "other"}` as PhraseKey, { count: fmt(n), ...vars }),
    fmt,
    dt,
  };
}
