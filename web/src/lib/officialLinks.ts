/**
 * Links out to a league's own site. The page sends a date, two abbreviations and, for the NHL, the
 * numeric game id. The addresses are built here, in the browser, so a kept page does not carry them.
 * A missing id, or an abbreviation we do not have for that season, still gets the day's page.
 * Nothing here is fetched. No ESPN or Sports Reference address is ever built.
 */

export type OfficialKind = "box" | "notes" | "day";

export interface OfficialLink {
  kind: OfficialKind;
  href: string;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ABBR = /^[A-Za-z]{2,3}$/;

/** 10 digits: season start year, two-digit type (01 preseason, 02 regular, 03 playoffs), four-digit number. */
const NHL_ID = /^(\d{4})(01|02|03)(\d{4})$/;

function day(date: string): string | null {
  return DATE.test(date) ? date : null;
}

function abbr(value: string | null | undefined): string | null {
  const s = (value ?? "").trim();
  return ABBR.test(s) ? s.toUpperCase() : null;
}

function nhlId(value: number | string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const s = String(value);
  return NHL_ID.test(s) ? s : null;
}

/** The NHL game page, the notes PDF, and that day's scores. Box and notes need the id and both abbreviations. */
export function nhlLinks(date: string, away: string | null, home: string | null, id: number | string | null | undefined): OfficialLink[] {
  const d = day(date);
  if (!d) return [];
  const out: OfficialLink[] = [];
  const gid = nhlId(id);
  const a = abbr(away), h = abbr(home);
  if (gid && a && h) {
    const [, year, , num] = gid.match(NHL_ID)!;
    const [yyyy, mm, dd] = d.split("-");
    const next = String(Number(year) + 1).padStart(4, "0");
    out.push({
      kind: "box",
      href: `https://www.nhl.com/gamecenter/${a.toLowerCase()}-vs-${h.toLowerCase()}/${yyyy}/${mm}/${dd}/${gid}`,
    });
    out.push({
      kind: "notes",
      href: `https://link.nhl.com/static/gamenotes/public/${year}${next}/gn-${d}-${num}-${a}@${h}.pdf`,
    });
  }
  out.push({ kind: "day", href: `https://www.nhl.com/scores/${d}` });
  return out;
}

/**
 * One day's page on the league's own site.
 * The NFL link is the season schedule: the archive does not store the week, and a week is not guessed from the date.
 * The CFL link is the league schedule, which is not dated.
 */
export function dayLink(league: string, date: string): OfficialLink | null {
  const d = day(date);
  if (!d) return null;
  if (league === "nhl") return { kind: "day", href: `https://www.nhl.com/scores/${d}` };
  if (league === "mlb") return { kind: "day", href: `https://www.mlb.com/scores/${d}` };
  if (league === "nba") return { kind: "day", href: `https://www.nba.com/games?date=${d}` };
  if (league === "nfl") return { kind: "day", href: "https://www.nfl.com/schedules/" };
  if (league === "cfl") return { kind: "day", href: "https://www.cfl.ca/schedule/" };
  return null;
}

export function officialLinks(p: {
  league: string;
  date: string;
  away?: string | null;
  home?: string | null;
  nhlId?: number | string | null;
}): OfficialLink[] {
  if (p.league === "nhl") return nhlLinks(p.date, p.away ?? null, p.home ?? null, p.nhlId);
  const one = dayLink(p.league, p.date);
  return one ? [one] : [];
}
