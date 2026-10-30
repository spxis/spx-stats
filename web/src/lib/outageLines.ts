import type { Carry, Club, CoachMove, Line, Person } from "./outage.ts";

/**
 * The tables of a season-outage page as short lines of plain data, not drawn cells: the clubs, head coaches and rosters set against each other were 30 rows of links, logos and
 * spans each, which travelled twice (as markup and as the elements the page sent to the browser, 40 KB of payload on /nhl/2004-05). The browser builds the cells from these lines
 * (components/OutageTables.tsx) and every row is still in the page. Pure, so a node script can test it.
 */

/** A club in one season: [rank, strength, wins, losses, ties, overtime losses, points]. */
export type ClubSide = [rank: number, strength: number | null, w: number, l: number, t: number, otl: number, pts: number | null];

/** A club on either side of the gap: [franchise, how it changed ("" none), before, after, places climbed, change in strength]. */
export type OutageClubLine = [f: number, kind: string, before: ClubSide | null, after: ClubSide | null, places: number | null, change: number | null];

const side = (c: Club | null): ClubSide | null => (c ? [c.rank, c.strength, c.w ?? 0, c.l ?? 0, c.t ?? 0, c.otl ?? 0, c.pts] : null);

export const outageClubLines = (lines: readonly Line[], kindOf: (f: number) => string): OutageClubLine[] =>
  lines.map((l) => [l.f, kindOf(l.f), side(l.before), side(l.after), l.places, l.change]);

/** A club's head coach each side of the gap: [franchise, name before ("" none), name after ("" none), 1 changed, 0 the same, -1 unknown]. */
export type OutageCoachLine = [f: number, before: string, after: string, changed: -1 | 0 | 1];

export const outageCoachLines = (coaches: readonly CoachMove[]): OutageCoachLine[] =>
  coaches.filter((c) => c.before || c.after).map((c) => [c.f, c.before?.name ?? "", c.after?.name ?? "", c.changed == null ? -1 : c.changed ? 1 : 0]);

/** A player named in a list: [page address, name]. */
export type OutagePerson = [href: string, name: string];

/** A club's roster against the last: [franchise, players before, stayed, left, arrived, continuity (null none), returners, departures, arrivals]; the three lists name the first three. */
export type OutageRosterLine = [f: number, n: number, stay: number, left: number, arrived: number, continuity: number | null, returners: OutagePerson[], departures: OutagePerson[], arrivals: OutagePerson[]];

export const outageRosterLines = (carry: readonly Carry[], href: (p: Person) => string): OutageRosterLine[] => {
  const names = (ps: readonly Person[]): OutagePerson[] => ps.slice(0, 3).map((p) => [href(p), p.name]);
  const byGames = (ps: readonly Person[]) => [...ps].sort((a, b) => b.gp - a.gp);
  return carry.map((c) => [
    c.f, c.sizeBefore, c.stayed.length, c.traded.length + c.gone.length, c.fromElsewhere.length + c.fresh.length, c.continuity,
    names(c.stayed), names(byGames([...c.traded, ...c.gone])), names(byGames([...c.fromElsewhere, ...c.fresh])),
  ]);
};

/** A player of a list across the gap: [page address, name, seasons, club (-1 none), season the club is named in]. */
export type OutagePersonLine = [href: string, name: string, seasons: number, f: number, y: number];

export const outagePersonLines = (people: readonly (Person & { club?: number; to?: number })[], href: (p: Person) => string, y: number): OutagePersonLine[] =>
  people.slice(0, 12).map((p) => [href(p), p.name, p.seasons, p.to ?? p.club ?? -1, y]);
