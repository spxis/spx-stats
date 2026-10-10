import { format, utcFormat } from "d3";

export const fmt = format(",");
export const fmt3 = format(".3f");
export const utc = {
  monthDay: utcFormat("%B %-d"),
  dayName: utcFormat("%a %b %-d"),
  monthDayShort: utcFormat("%b %-d"),
  monthYear: utcFormat("%B %Y"),
  full: utcFormat("%A, %B %-d, %Y"),
  short: utcFormat("%a %b %-d, %Y"),
  iso: utcFormat("%Y-%m-%d"),
  mon: utcFormat("%b"),
  monYear: utcFormat("%b %y"),
};
export const atUtc = (ymd: string): Date => new Date(`${ymd}T00:00:00Z`);
