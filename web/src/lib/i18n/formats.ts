import { LOCALE_TAG, type Locale } from "@/lib/locale";

/** Dates are calendar days kept as UTC midnight, so every format reads them in UTC. */
const UTC = "UTC";

export interface DateFormats {
  monthDay: (d: Date) => string;
  dayName: (d: Date) => string;
  monthDayShort: (d: Date) => string;
  monthYear: (d: Date) => string;
  full: (d: Date) => string;
  /** June 3, 1990 */
  ymd: (d: Date) => string;
  short: (d: Date) => string;
  mon: (d: Date) => string;
  monYear: (d: Date) => string;
  /** Sunday to Saturday, abbreviated, and in full. */
  weekdays: string[];
  weekdaysLong: string[];
}

export interface Formats {
  fmt: (n: number) => string;
  dt: DateFormats;
}

const dateFmt = (tag: string, o: Intl.DateTimeFormatOptions) => {
  const f = new Intl.DateTimeFormat(tag, { ...o, timeZone: UTC });
  return (d: Date) => f.format(d);
};

function build(locale: Locale): Formats {
  const tag = LOCALE_TAG[locale];
  const num = new Intl.NumberFormat(tag, { maximumFractionDigits: 20 });
  const wd = new Intl.DateTimeFormat(tag, { weekday: "short", timeZone: UTC });
  const wdl = new Intl.DateTimeFormat(tag, { weekday: "long", timeZone: UTC });
  return {
    fmt: (n) => num.format(n),
    dt: {
      monthDay: dateFmt(tag, { month: "long", day: "numeric" }),
      dayName: dateFmt(tag, { weekday: "short", month: "short", day: "numeric" }),
      monthDayShort: dateFmt(tag, { month: "short", day: "numeric" }),
      monthYear: dateFmt(tag, { month: "long", year: "numeric" }),
      full: dateFmt(tag, { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
      ymd: dateFmt(tag, { year: "numeric", month: "long", day: "numeric" }),
      short: dateFmt(tag, { weekday: "short", year: "numeric", month: "short", day: "numeric" }),
      mon: dateFmt(tag, { month: "short" }),
      monYear: dateFmt(tag, { month: "short", year: "2-digit" }),
      // 2023-01-01 was a Sunday.
      weekdays: Array.from({ length: 7 }, (_, i) => wd.format(new Date(Date.UTC(2023, 0, 1 + i)))),
      weekdaysLong: Array.from({ length: 7 }, (_, i) => wdl.format(new Date(Date.UTC(2023, 0, 1 + i)))),
    },
  };
}

const cache = new Map<Locale, Formats>();

/** The number and date formats of a language (en-CA, fr-CA, ja-JP), built once. */
export function formatsFor(locale: Locale): Formats {
  let f = cache.get(locale);
  if (!f) cache.set(locale, (f = build(locale)));
  return f;
}
