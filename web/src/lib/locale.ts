/**
 * The languages the site speaks. English is the one every string is written in; French and Japanese are
 * translations kept beside it (lib/i18n/dictionaries). The reader's choice lives in a cookie, set through the
 * footer's picker; without one the browser's Accept-Language decides, and failing that it is English.
 */
export const LOCALES = ["en", "fr", "ja"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE_NAME = "spxn-locale";
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function isLocale(value: string | null | undefined): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** How each language names itself in the picker. */
export const LOCALE_DISPLAY: Record<Locale, string> = { en: "EN", fr: "FR", ja: "日本語" };

/** The BCP 47 tag that Intl formats by, and the one Open Graph names. */
export const LOCALE_TAG: Record<Locale, string> = { en: "en-CA", fr: "fr-CA", ja: "ja-JP" };
export const LOCALE_OG: Record<Locale, string> = { en: "en_CA", fr: "fr_CA", ja: "ja_JP" };

/** The first language of an Accept-Language header that the site speaks, best-weighted first; English otherwise. */
export function pickLocale(accept: string | null | undefined): Locale {
  if (!accept) return DEFAULT_LOCALE;
  const ranked = accept
    .split(",")
    .map((part, order) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), weight: Number.isFinite(weight) ? weight : 0, order };
    })
    .filter((x) => x.tag && x.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.order - b.order);
  for (const { tag } of ranked) {
    const primary = tag.split("-")[0];
    if (isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}

/** A remembered choice first, then the browser's own, then English. */
export function effectiveLocale(stored: string | null | undefined, accept: string | null | undefined): Locale {
  return isLocale(stored) ? stored : pickLocale(accept);
}
