/**
 * Links out to a league's own site, or to Retrosheet for an MLB box score. The page sends a date,
 * two abbreviations and, where a published field has one, the NHL id, the NFL week or the Retrosheet
 * home code and game number. The addresses are built here, in the browser, so a kept page does not
 * carry them. A missing id still gets the day's page. Nothing here is fetched. No ESPN or Sports
 * Reference address is ever built, and a Retrosheet id is never sent to mlb.com.
 *
 * Game notes are posted close to the start. They stay in the list once the game is no longer
 * scheduled, or once a known start is no longer ahead of the clock the browser reads at view time.
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

/**
 * Whether to link the notes PDF. A status other than `scheduled` means the game has started or is
 * over. A scheduled game waits for `startsAt`: no start, or a start still ahead of `now`, leaves
 * the link out. `now` is milliseconds since the epoch. A missing status keeps the link, so a
 * caller that is only checking the address still gets it.
 */
export function gameNotesReady(status: string | null | undefined, startsAt: string | null | undefined, now: number): boolean {
  if (status !== "scheduled") return true;
  if (startsAt == null || startsAt === "") return false;
  const t = Date.parse(startsAt);
  return Number.isFinite(t) && t <= now;
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

/** The Retrosheet home code and game number, as the view's retro_box column writes them: TOR:0. */
const RETRO_BOX = /^([A-Z0-9]{3}):([0-3])$/;

/**
 * The club's nickname as NFL.com uses it in a game address: ravens, 49ers, football-team.
 * The last word of the full name, except the one two-word nickname the archive holds.
 */
function nflSlug(name: string | null | undefined): string | null {
  const s = (name ?? "").trim();
  if (!s) return null;
  const words = s.split(/\s+/);
  const nick = /football team$/i.test(s) ? "football team" : words[words.length - 1] ?? "";
  const slug = nick.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : null;
}

/**
 * NFL.com's season type and week. The week number comes from the nflverse id, never from the date.
 * Regular season keeps that week (`reg-1`). The postseason page numbers the rounds 1 to 4, and the
 * id's week of the wild-card round is 18 through 2020 and 19 from 2021.
 */
export function nflPhaseWeek(year: number, phase: string, week: number): { kind: "reg" | "post"; n: number } | null {
  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 22) return null;
  if (phase === "regular") return week <= 18 ? { kind: "reg", n: week } : null;
  if (phase !== "playoffs") return null;
  const round = week - (year >= 2021 ? 19 : 18) + 1;
  return round >= 1 && round <= 4 ? { kind: "post", n: round } : null;
}

/** The NFL game page when the week and both clubs are known, then the season schedule. */
export function nflLinks(year: number, phase: string, week: number | null | undefined, awayName: string | null, homeName: string | null, date: string): OfficialLink[] {
  const d = day(date);
  if (!d) return [];
  const out: OfficialLink[] = [];
  const away = nflSlug(awayName), home = nflSlug(homeName);
  const slot = week == null ? null : nflPhaseWeek(year, phase, week);
  if (away && home && slot) {
    out.push({ kind: "box", href: `https://www.nfl.com/games/${away}-at-${home}-${year}-${slot.kind}-${slot.n}` });
  }
  out.push({ kind: "day", href: "https://www.nfl.com/schedules/" });
  return out;
}

/**
 * Retrosheet's box score when the home code and game number are known, then that day's scores on MLB.com.
 * The box address is the one Retrosheet publishes: B, month, day, game number, home code, year.
 */
export function mlbLinks(date: string, retroBox: string | null | undefined): OfficialLink[] {
  const d = day(date);
  if (!d) return [];
  const out: OfficialLink[] = [];
  const m = RETRO_BOX.exec((retroBox ?? "").trim());
  if (m) {
    const [yyyy, mm, dd] = d.split("-");
    out.push({ kind: "box", href: `https://www.retrosheet.org/boxesetc/${yyyy}/B${mm}${dd}${m[2]}${m[1]}${yyyy}.htm` });
  }
  out.push({ kind: "day", href: `https://www.mlb.com/scores/${d}` });
  return out;
}

/**
 * One day's page on the league's own site.
 * The NFL link is the season schedule when the week is not on the row. A week is not guessed from the date.
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
  /** Full club names, for the NFL game address. Abbreviations are not the slugs NFL.com uses. */
  awayName?: string | null;
  homeName?: string | null;
  /** Season start year. The NFL address uses it with the week from the id. */
  year?: number | null;
  phase?: string | null;
  nhlId?: number | string | null;
  /** The week from an nflverse id. Absent or null leaves the schedule link only. */
  nflWeek?: number | null;
  /** Retrosheet home code and game number, TOR:0. Absent or null leaves the day's scores only. */
  retroBox?: string | null;
  /** core.game status. Omitted only when the caller is checking the address, not whether to show it. */
  status?: string | null;
  /** Scheduled start, UTC, when a source recorded one. */
  startsAt?: string | null;
  /** The viewer's clock, milliseconds since the epoch, read in the browser. */
  now?: number;
}): OfficialLink[] {
  if (p.league === "nfl") return nflLinks(p.year ?? Number.NaN, p.phase ?? "", p.nflWeek, p.awayName ?? null, p.homeName ?? null, p.date);
  if (p.league === "mlb") return mlbLinks(p.date, p.retroBox);
  if (p.league !== "nhl") {
    const one = dayLink(p.league, p.date);
    return one ? [one] : [];
  }
  const now = p.now ?? Number.NaN;
  return nhlLinks(p.date, p.away ?? null, p.home ?? null, p.nhlId)
    .filter((link) => link.kind !== "notes" || gameNotesReady(p.status, p.startsAt, now));
}
