/** Every flag on the site is drawn in the same box. These numbers are repeated in components/flag.css; scripts/flags.test.ts checks they agree. */
export const FLAG_WIDTH = 24;
export const FLAG_HEIGHT = 16;

/**
 * Hata's drawings carry a viewBox but no width or height, so left alone they stretch to fill whatever holds them.
 * This gives the drawing the fixed box; the viewBox keeps its own shape inside (contained, never stretched).
 */
export function sizeFlagSvg(svg: string): string {
  return svg.replace(/<svg\b([^>]*)>/, (_m, attrs: string) => {
    const rest = attrs.replace(/\s(?:width|height|aria-hidden|focusable)="[^"]*"/g, "");
    return `<svg width="${FLAG_WIDTH}" height="${FLAG_HEIGHT}" aria-hidden="true" focusable="false"${rest}>`;
  });
}
