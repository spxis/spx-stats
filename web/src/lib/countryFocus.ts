/**
 * The shared highlight of the country sections (chips, donut, legend and map): which country is chosen (`?nat=`) and which is under the pointer or
 * keyboard focus, and what each place draws for them. Pure, so a node script can test it.
 */
import { interpolateRgb } from "d3";

/** A code that names a country: two capitals. Everything else a hover can land on (the unknown, the others, a map's inset frame) names none. */
export const isCountryCode = (code: string | null | undefined): code is string => !!code && /^[A-Z]{2}$/.test(code) && code !== "ZZ";

/** The countries to emphasise: the chosen one and the one under the pointer or focus. */
export const focused = (chosen: string | null | undefined, hover: string | null | undefined): string[] =>
  [...new Set([chosen, hover].filter(isCountryCode))];

/** A slice of the donut as far as the highlight is concerned: a country, all the smaller ones together (with their codes), or the unknown ones. */
export interface FocusSlice { code: string; kind?: "country" | "other" | "unknown"; members?: readonly string[] }

/** Whether a slice holds one of the focused countries (the "other" slice holds the ones it lists). */
export function holds(s: FocusSlice, codes: readonly string[]): boolean {
  if (s.kind === "unknown") return false;
  if (s.kind === "other") return codes.some((c) => s.members?.includes(c));
  return codes.includes(s.code);
}

/** For each slice: emphasised, dimmed (something else is), or neither (nothing focused, or none of the focused countries is in the chart). */
export function sliceStates(slices: readonly FocusSlice[], codes: readonly string[]): ("on" | "dim" | "")[] {
  const on = slices.map((s) => holds(s, codes));
  const any = on.some(Boolean);
  return on.map((v) => (v ? "on" : any ? "dim" : ""));
}

/** The ink the map's greyed-out countries are mixed toward, and what the hover colour is mixed toward. */
const MUTE = "#d3d8dd";
const LIGHT = "#ffffff";
/** How far a country is greyed while another is chosen, and how far the hover colour is lightened. */
export const MUTE_BY = 0.72;
export const LIGHTEN_BY = 0.4;

const mix = (a: string, b: string, t: number): string => interpolateRgb(a, b)(t);

/**
 * The map's colour for each country with players, under the highlight. With none focused it is `base` as it came (the count ramp). A chosen country is
 * the accent and every other country with players is greyed; the one under the pointer is the accent lightened (so it reads as a hover beside the choice).
 * `base` holds only countries with players, and so does the answer.
 */
export function focusColors(base: Readonly<Record<string, string>>, chosen: string | null | undefined, hover: string | null | undefined, accent: string): Record<string, string> {
  const pick = isCountryCode(chosen) && chosen in base ? chosen : null;
  const over = isCountryCode(hover) && hover in base ? hover : null;
  if (!pick && !over) return { ...base };
  const out: Record<string, string> = {};
  for (const [code, color] of Object.entries(base)) out[code] = pick ? mix(color, MUTE, MUTE_BY) : color;
  if (pick) out[pick] = accent;
  if (over && over !== pick) out[over] = mix(accent, LIGHT, LIGHTEN_BY);
  return out;
}
