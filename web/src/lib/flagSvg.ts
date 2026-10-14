/** Every flag on the site is drawn in one of these boxes. These numbers are repeated in components/flag.css; scripts/flags.test.ts checks they agree. */
export const FLAG_WIDTH = 24;
export const FLAG_HEIGHT = 16;
/** The side of the round and square boxes, used for the country buttons and chips. */
export const FLAG_SIDE = 18;
/** The side of the one large round flag: the national teams' flags in the heading of a World Cup match, head-to-head or team page (components/SoccerFlag.tsx). */
export const FLAG_ROUND_LARGE = 56;
/** The side of the biggest round flag: a national team's flag in the crest circle of the match banner (components/Showdown.tsx). The same at every width. */
export const FLAG_ROUND_HERO = 72;

/** `rect` is the flag as a flag (the default, in tables and headings); `round` and `square` are for country buttons and chips. */
export type FlagShape = "rect" | "round" | "square";

/** What Hata is asked for each shape: the flag as it is, or Hata's own round and 1:1 frames (never hand-clipped here). */
export const HATA_SHAPE: Readonly<Record<FlagShape, { shape: "round" | "1:1" } | undefined>> = {
  rect: undefined,
  round: { shape: "round" },
  square: { shape: "1:1" },
};

/** The box a shape is drawn in. */
export function flagBox(shape: FlagShape = "rect"): { width: number; height: number } {
  return shape === "rect" ? { width: FLAG_WIDTH, height: FLAG_HEIGHT } : { width: FLAG_SIDE, height: FLAG_SIDE };
}

/**
 * Where a flag's own file is (app/flag/[file]): `/flag/CA.svg`, `/flag/CA.round.svg`, `/flag/CA.square.svg`. A page draws a flag as an image of this
 * address, so the drawing (up to 100 KB) is fetched once per browser and never repeated in a page's markup or payload.
 */
export function flagAddress(code: string, shape: FlagShape = "rect"): string {
  return `/flag/${code.toUpperCase()}${shape === "rect" ? "" : `.${shape}`}.svg`;
}

/** What a name under /flag/ may be: a country's or subdivision's code, then optionally the shape. */
export const FLAG_FILE = /^([A-Za-z]{2}(?:-[A-Za-z0-9]{1,3})?)(?:\.(round|square))?\.svg$/;

/**
 * Hata's drawings carry a viewBox but no width or height, so left alone they stretch to fill whatever holds them.
 * This gives the drawing the fixed box; the viewBox keeps its own shape inside (contained, never stretched).
 */
export function sizeFlagSvg(svg: string, shape: FlagShape = "rect"): string {
  const { width, height } = flagBox(shape);
  return svg.replace(/<svg\b([^>]*)>/, (_m, attrs: string) => {
    const rest = attrs.replace(/\s(?:width|height|aria-hidden|focusable)="[^"]*"/g, "");
    return `<svg width="${width}" height="${height}" aria-hidden="true" focusable="false"${rest}>`;
  });
}
