import { interpolateRgb } from "d3";

/** The two ends of the colour ramp (the site's data-viz blue, steps 250 and 600): the same in light and dark, because Chizu paints a country the same in both. */
export const RAMP: [string, string] = ["#86b6ef", "#184f95"];
const mix = interpolateRgb(RAMP[0], RAMP[1]);

/** A country's fill: the more players, the darker, on a log scale so a handful of players still shows against thousands. */
export function rampColor(n: number, max: number): string {
  return mix(max > 0 ? Math.log1p(Math.max(n, 0)) / Math.log1p(max) : 0);
}

/** An address with `{code}` in it for a country: `/players?nat={code}` gives `/players?nat=CA`. Client components take the address this way because a function cannot cross from a page to them. */
export const fillHref = (template: string, code: string): string => template.replace("{code}", code);

/** The fill of each country with players, by code (a country with none keeps the map's own land). */
export function colorsOf(counts: Record<string, number>): Record<string, string> {
  const max = Math.max(0, ...Object.values(counts));
  return Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0).map(([c, n]) => [c, rampColor(n, max)]));
}
