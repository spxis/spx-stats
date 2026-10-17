import { memberHref, type FamilyId } from "./leagueFamilies.ts";

export interface HomeCardLine {
  code: string;
  name: string;
  short: string;
  color: string;
  href: string;
  from?: number;
  to?: number;
  seasons: number;
  championSeason?: string;
  championTeam?: string;
}

export interface HomeFamilyCard extends HomeCardLine {
  family: FamilyId;
  plus: boolean;
  kids: HomeCardLine[];
}

export function lineOf(
  code: string,
  name: string,
  short: string,
  color: string,
  list: { year: number; label: string; games: number; champion: string | null }[],
  href = memberHref(code),
): HomeCardLine {
  const played = list.filter((x) => x.games > 0);
  const last = list.filter((x) => x.champion).at(-1);
  return {
    code, name, short, color, href,
    from: played[0]?.year,
    to: played.at(-1)?.year,
    seasons: played.length,
    championSeason: last?.label,
    championTeam: last?.champion ?? undefined,
  };
}
