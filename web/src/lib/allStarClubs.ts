/**
 * Which club a roster line or a Most Valuable Player line names, for the logo and the link. The lines come from Wikipedia as it prints them ("Philadelphia", "Yankees",
 * "N.Y. Giants", "Boston (AL)", "BOS"; the league in brackets is dropped), the clubs from the season's standings (their full names that season). A line names a club only when exactly one club of the league's
 * season fits it, by its full name, its last words (the nickname), its first words (the city), or its abbreviation; "Chicago" in a league with two Chicago clubs, or "New York",
 * names none, so the name stays plain text. Pure.
 */
export interface ClubRow { franchise_id: number; team: string | null; abbr?: string | null }

const plain = (s: string): string =>
  s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/\bn\.?\s?y\.?(?=\s)/g, "new york").replace(/\bl\.?\s?a\.?(?=\s)/g, "los angeles")
    .replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).join(" ");

/** The matcher for one league's season: a club's franchise id, or null when the text fits none or several. */
export function clubMatcher(rows: readonly ClubRow[]): (text: string | null | undefined) => number | null {
  const clubs = rows.filter((r) => r.team).map((r) => ({ f: r.franchise_id, name: plain(r.team!), abbr: r.abbr ?? null }));
  return (text) => {
    const raw = (text ?? "").trim();
    if (!raw) return null;
    const q = plain(raw.replace(/\([^)]*\)\s*$/, ""));
    if (!q) return null;
    const tests: ((c: (typeof clubs)[number]) => boolean)[] = [
      (c) => c.name === q,
      (c) => c.name.endsWith(` ${q}`),
      (c) => c.name.startsWith(`${q} `),
      (c) => /^[A-Za-z]{2,4}$/.test(raw) && c.abbr != null && c.abbr.toUpperCase() === raw.toUpperCase(),
    ];
    for (const t of tests) {
      const hit = new Set(clubs.filter(t).map((c) => c.f));
      if (hit.size === 1) return [...hit][0];
      if (hit.size > 1) return null;
    }
    return null;
  };
}
