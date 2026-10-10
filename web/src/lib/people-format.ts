import { LOCALE_TAG, type Locale } from "@/lib/locale";

const names = new Map<Locale, Intl.DisplayNames | null>();
const regions = (locale: Locale) => {
  if (!names.has(locale)) {
    try { names.set(locale, new Intl.DisplayNames([LOCALE_TAG[locale]], { type: "region" })); } catch { names.set(locale, null); }
  }
  return names.get(locale) ?? null;
};

/** A country's name in the reader's language from its ISO code. */
export function countryName(code: string, locale: Locale): string {
  try { return regions(locale)?.of(code.toUpperCase()) || code; } catch { return code; }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const capFirst = cap;

export function inches(cm: number): string {
  const t = Math.round(cm / 2.54);
  return `${Math.floor(t / 12)} ft ${t % 12} in`;
}

/** Whole years between a birth and a death, or today when still living. */
export function ageOn(born: string | null, died: string | null): number | null {
  if (!born) return null;
  const b = new Date(`${born}T00:00:00Z`), e = died ? new Date(`${died}T00:00:00Z`) : new Date();
  let a = e.getUTCFullYear() - b.getUTCFullYear();
  if (e.getUTCMonth() < b.getUTCMonth() || (e.getUTCMonth() === b.getUTCMonth() && e.getUTCDate() < b.getUTCDate())) a -= 1;
  return a >= 0 && a < 125 ? a : null;
}
