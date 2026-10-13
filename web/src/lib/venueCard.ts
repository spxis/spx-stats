/**
 * The summary card of a reader's venue visits, drawn in the browser as one SVG (1200 x 630, the usual size of a share image) and
 * downloaded from there; it is never uploaded. It holds counts only, never a venue's name or a note. Pure: the words arrive already
 * in the reader's language, so a node script can test it.
 */
import type { Counts } from "./venueVisits.ts";

export interface CardWords {
  /** "Venues visited" */
  title: string;
  /** "27 of 242", already written */
  headline: string;
  /** "6 of them gone", or null */
  gone: string | null;
  /** One line per league, in order: the league's name and its "12 of 40". */
  leagues: { name: string; text: string; seen: number; of: number }[];
  /** "spxn.com/venues" */
  site: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const FONT = "system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

/** The words of the card from the counts. `name` writes a league's code as its name, `of` writes "12 of 40". */
export function cardWords(counts: Counts, leagues: readonly string[], o: { title: string; site: string; name: (lg: string) => string; of: (seen: number, of: number) => string; gone: (n: number) => string }): CardWords {
  return {
    title: o.title,
    headline: o.of(counts.all.seen, counts.all.of),
    gone: counts.all.goneSeen ? o.gone(counts.all.goneSeen) : null,
    leagues: leagues.filter((lg) => counts.byLeague[lg]).map((lg) => ({ name: o.name(lg), text: o.of(counts.byLeague[lg].seen, counts.byLeague[lg].of), seen: counts.byLeague[lg].seen, of: counts.byLeague[lg].of })),
    site: o.site,
  };
}

/** The card as SVG text. Colours are fixed (it is shown outside the site, so it cannot follow the reader's theme). */
export function cardSvg(w: CardWords): string {
  const rows = w.leagues.slice(0, 8);
  const rowH = 52, top = 330, barX = 420, barW = 700;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630" role="img" aria-label="${esc(`${w.title}: ${w.headline}`)}">`,
    `<rect width="1200" height="630" fill="#17202a"/>`,
    `<text x="60" y="96" font-family="${FONT}" font-size="34" font-weight="700" letter-spacing="3" fill="#9aa4ad">${esc(w.title.toUpperCase())}</text>`,
    `<text x="60" y="226" font-family="${FONT}" font-size="120" font-weight="800" fill="#f5f6f2">${esc(w.headline)}</text>`,
  ];
  if (w.gone) parts.push(`<text x="60" y="282" font-family="${FONT}" font-size="36" fill="#e0a83d">${esc(w.gone)}</text>`);
  rows.forEach((r, i) => {
    const y = top + i * rowH, share = r.of ? Math.min(r.seen / r.of, 1) : 0;
    parts.push(
      `<text x="60" y="${y + 30}" font-family="${FONT}" font-size="28" font-weight="700" fill="#f5f6f2">${esc(r.name)}</text>`,
      `<text x="${barX - 20}" y="${y + 30}" font-family="${FONT}" font-size="26" text-anchor="end" fill="#c9d0d6">${esc(r.text)}</text>`,
      `<rect x="${barX}" y="${y + 8}" width="${barW}" height="28" rx="4" fill="#2c343d"/>`,
      `<rect x="${barX}" y="${y + 8}" width="${Math.round(barW * share)}" height="28" rx="4" fill="#5aa6e6"/>`,
    );
  });
  parts.push(`<text x="1140" y="596" font-family="${FONT}" font-size="26" text-anchor="end" fill="#9aa4ad">${esc(w.site)}</text>`, `</svg>`);
  return parts.join("");
}

/** The same as one line of text, for pasting into a message. */
export const cardText = (w: CardWords): string =>
  [`${w.title}: ${w.headline}${w.gone ? `, ${w.gone}` : ""}`, ...w.leagues.map((l) => `${l.name} ${l.text}`), w.site].join("\n");
