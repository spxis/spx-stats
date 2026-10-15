import { BrandShield } from "./BrandShield";
import { getAbbrs, getBrands } from "@/lib/data";
import { brandFor, logoFor, type BrandMap } from "@/lib/brand";
import { officialAbbr, type AbbrMap } from "@/lib/abbr";
import { SPXN_SHIELD, teamShield } from "@/lib/shieldFit";

const LEAGUES = ["nhl", "nba", "mlb", "nfl"] as const;
/** Familiar clubs first; if the data lacks them, the first club of the league that has a logo and a colour. */
const PREFER: Record<(typeof LEAGUES)[number], string[]> = { nhl: ["TOR", "MTL", "BOS"], nba: ["LAL", "BOS", "CHI"], mlb: ["NYY", "BOS", "LAD"], nfl: ["GB", "GNB", "DAL"] };

export interface ShieldTeam { league: string; abbr: string; logo: string; primary: string | null; secondary: string | null }

/** One club for each league the examples show: a logo, an abbreviation and colours (null when the data does not load). */
export function pickShieldTeams(brands: BrandMap, abbrs: Record<string, AbbrMap>): ShieldTeam[] {
  const out: ShieldTeam[] = [];
  for (const lg of LEAGUES) {
    const map = abbrs[lg] ?? {};
    const found = Object.keys(map).map(Number).flatMap((f) => {
      const abbr = officialAbbr(map, f), logo = logoFor(brands, f), b = brandFor(brands, f);
      return abbr && logo && b?.primary_hex ? [{ league: lg, abbr, logo, primary: b.primary_hex, secondary: b.secondary_hex }] : [];
    });
    const pick = PREFER[lg].map((a) => found.find((t) => t.abbr === a)).find(Boolean) ?? found[0];
    if (pick) out.push(pick);
  }
  return out;
}

export interface ShieldLabels { logoTeam: string; abbrTeam: string; logoNavy: string; abbrNavy: string }

/**
 * The shield container (BrandShield) tried on four clubs: a logo and an abbreviation inside, in the club's colours and in SPXN navy (the last with the league in
 * the band). A preview for About and /admin/logos; the public site uses the shield nowhere else yet. The data is the cached brand and abbreviation reads
 * those pages already make.
 */
export async function BrandShieldExamples({ labels, size = 96 }: { labels: ShieldLabels; size?: number }) {
  const [brands, ...lists] = await Promise.all([getBrands(), ...LEAGUES.map((l) => getAbbrs(l))]);
  const teams = pickShieldTeams(brands, Object.fromEntries(LEAGUES.map((l, i) => [l, lists[i]])));
  if (!teams.length) return null;
  return (
    <div className="bshields">
      {[labels.logoTeam, labels.abbrTeam, labels.logoNavy, labels.abbrNavy].map((l) => <span key={l} className="cap">{l}</span>)}
      {teams.map((t) => {
        const colours = teamShield(t.primary, t.secondary);
        return [
          <BrandShield key={`${t.abbr}-a`} size={size} content={{ logo: t.logo, alt: t.abbr }} colours={colours} />,
          <BrandShield key={`${t.abbr}-b`} size={size} content={{ abbr: t.abbr }} colours={colours} />,
          <BrandShield key={`${t.abbr}-c`} size={size} content={{ logo: t.logo, alt: t.abbr }} colours={SPXN_SHIELD} />,
          <BrandShield key={`${t.abbr}-d`} size={size} content={{ abbr: t.abbr }} colours={SPXN_SHIELD} band={t.league} />,
        ];
      })}
    </div>
  );
}
