/** One team of a player as the Teams column draws it: its page, the logo (the one of the player's last season there, else the current one, dimmed) and the tooltip line. */
export interface TeamChip { key: string; href: string; name: string; logo: string | null; dim: boolean; tip: string }

/** A chip as the page sends it, one short array: [the club's address, its logo's place in the page's list of logos (-1 for none), the tooltip line, 1 when the logo is dimmed, the initials a club with no logo shows]. */
export type ChipTuple = [href: string, logo: number, tip: string, dim: 0 | 1, initials?: string];

/** The letters that stand for a club with no logo: the first letter of up to three words of its name. */
export const initialsOf = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w[0]).join("").toUpperCase();

/** A chip's tuple, and the place of its logo in `logos` (a logo address is long and a club's logo is on a dozen rows: the page sends each once). */
export function chipTuple(t: TeamChip, logos: string[]): ChipTuple {
  let i = -1;
  if (t.logo) { i = logos.indexOf(t.logo); if (i < 0) i = logos.push(t.logo) - 1; }
  return i >= 0 ? [t.href, i, t.tip, t.dim ? 1 : 0] : [t.href, -1, t.tip, 0, initialsOf(t.name)];
}
