/**
 * The teams page's list as it travels to the browser. Every franchise was sent as an object of sixteen named fields (about 270 B each, 140 KB for 539 clubs)
 * with the whole address of every logo; now each is a short array (the names of its league, conferences and divisions, country and city once in tables the
 * rows point into) and the logo addresses are written as a few shared beginnings and endings. `unpackTeams` is the exact inverse of `packTeams`, so the
 * board filters, sorts and draws what it always did. Pure and import-light, so the page, the board and a node script share it.
 */
import type { BoardTeam } from "./teamBoard.ts";
import type { Place } from "./teamGroups.ts";

/**
 * `lg` the league codes, `pl` each distinct [conference, division] pair, `cc` the country codes, `pn` the city names, `lp` and `lq` the beginnings and the
 * query endings of the logo addresses and `l` the logos as "beginning~ending~rest". A club is
 *   [league, franchise id, name, first season, last season, seasons, titles, win share in thousandths, active 0|1, logo (-1 none), country (-1 none),
 *    latitude, longitude, city (-1 none), places (indexes into pl), ...former names as name, logo, name, logo ...]
 */
export interface TeamsWire {
  lg: string[]; pl: Place[]; cc: string[]; pn: string[]; lp: string[]; lq: string[]; l: string[];
  t: (string | number | null | number[])[][];
}

const BEGIN = /^(?:https?:\/\/[^/]+\/wikipedia\/[a-z]+\/(?:thumb\/)?|\/team-logos\/sl\/)/;

export function packTeams(teams: readonly BoardTeam[], logos: readonly string[]): TeamsWire {
  const lg: string[] = [], pl: Place[] = [], cc: string[] = [], pn: string[] = [], lp: string[] = [], lq: string[] = [];
  const index = <T,>(list: T[], at: Map<string, number>, key: string, value: T): number => {
    let i = at.get(key);
    if (i === undefined) { i = list.length; list.push(value); at.set(key, i); }
    return i;
  };
  const aLg = new Map<string, number>(), aPl = new Map<string, number>(), aCc = new Map<string, number>(), aPn = new Map<string, number>(), aLp = new Map<string, number>(), aLq = new Map<string, number>();
  const l = logos.map((url) => {
    const [base, query = ""] = url.split("?", 2);
    const head = BEGIN.exec(base)?.[0] ?? "";
    return `${index(lp, aLp, head, head)}~${index(lq, aLq, query, query)}~${base.slice(head.length)}`;
  });
  const t = teams.map((x) => {
    const row: (string | number | null | number[])[] = [
      index(lg, aLg, x.lg, x.lg), x.f, x.name, x.first, x.last, x.seasons, x.titles, x.share == null ? null : Math.round(x.share * 1000), x.active ? 1 : 0, x.logo,
      x.cc == null ? -1 : index(cc, aCc, x.cc, x.cc), x.lat, x.lon, x.place == null ? -1 : index(pn, aPn, x.place, x.place),
      x.places.map((p) => index(pl, aPl, JSON.stringify(p), p)),
    ];
    for (const [name, logo] of x.former) row.push(name, logo);
    return row;
  });
  return { lg, pl, cc, pn, lp, lq, l, t };
}

export function unpackTeams(wire: TeamsWire): { teams: BoardTeam[]; logos: string[] } {
  const logos = wire.l.map((s) => {
    const a = s.indexOf("~"), b = s.indexOf("~", a + 1);
    const q = wire.lq[Number(s.slice(a + 1, b))];
    return `${wire.lp[Number(s.slice(0, a))]}${s.slice(b + 1)}${q ? `?${q}` : ""}`;
  });
  const teams = wire.t.map((r): BoardTeam => {
    const former: [string, number][] = [];
    for (let i = 15; i < r.length; i += 2) former.push([String(r[i]), Number(r[i + 1])]);
    return {
      lg: wire.lg[Number(r[0])], f: Number(r[1]), name: String(r[2]), former, first: r[3] as number | null, last: r[4] as number | null, seasons: Number(r[5]), titles: Number(r[6]),
      share: r[7] == null ? null : Number(r[7]) / 1000, active: r[8] === 1, logo: Number(r[9]), cc: Number(r[10]) < 0 ? null : wire.cc[Number(r[10])],
      lat: r[11] as number | null, lon: r[12] as number | null, place: Number(r[13]) < 0 ? null : wire.pn[Number(r[13])],
      places: (r[14] as number[]).map((i) => wire.pl[i]),
    };
  });
  return { teams, logos };
}
