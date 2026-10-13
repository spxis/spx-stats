import type { Locale } from "./locale.ts";

/**
 * A national team's name in the reader's language. English is the name the data gives (West Germany, Ivory Coast). French and Japanese
 * take the country's name from the browser's own tables (Intl.DisplayNames) where the team has an ISO country code; the four home
 * nations and the states that no longer exist have no such code, so they are written here.
 */
const SPECIAL: Record<string, { fr: string; ja: string }> = {
  england: { fr: "Angleterre", ja: "イングランド" },
  scotland: { fr: "Écosse", ja: "スコットランド" },
  wales: { fr: "Pays de Galles", ja: "ウェールズ" },
  "northern-ireland": { fr: "Irlande du Nord", ja: "北アイルランド" },
  "west-germany": { fr: "Allemagne de l’Ouest", ja: "西ドイツ" },
  "east-germany": { fr: "Allemagne de l’Est", ja: "東ドイツ" },
  "soviet-union": { fr: "Union soviétique", ja: "ソビエト連邦" },
  yugoslavia: { fr: "Yougoslavie", ja: "ユーゴスラビア" },
  czechoslovakia: { fr: "Tchécoslovaquie", ja: "チェコスロバキア" },
  zaire: { fr: "Zaïre", ja: "ザイール" },
  "dutch-east-indies": { fr: "Indes orientales néerlandaises", ja: "オランダ領東インド" },
  "serbia-and-montenegro": { fr: "Serbie-et-Monténégro", ja: "セルビア・モンテネグロ" },
  "dr-congo": { fr: "RD Congo", ja: "コンゴ民主共和国" },
  "chinese-taipei": { fr: "Taipei chinois", ja: "チャイニーズ・タイペイ" },
};

const names = new Map<Locale, Intl.DisplayNames>();
const displayNames = (locale: Locale): Intl.DisplayNames | null => {
  try {
    if (!names.has(locale)) names.set(locale, new Intl.DisplayNames([locale], { type: "region" }));
    return names.get(locale) ?? null;
  } catch {
    return null;
  }
};

export function teamName(team: { name: string; slug: string; flag: string | null | undefined }, locale: Locale): string {
  if (locale === "en") return team.name;
  const special = SPECIAL[team.slug];
  if (special) return special[locale];
  if (team.flag && /^[A-Z]{2}$/.test(team.flag)) {
    try {
      const n = displayNames(locale)?.of(team.flag);
      if (n && n !== team.flag) return n;
    } catch { /* an unknown code: the data's name */ }
  }
  return team.name;
}

/** The four home nations by their ISO 3166-2 code (GB-ENG), which Intl.DisplayNames does not know; null for any other code. */
const NATIONS: Record<string, string> = { "GB-ENG": "england", "GB-SCT": "scotland", "GB-WLS": "wales", "GB-NIR": "northern-ireland" };
const NATION_EN: Record<string, string> = { england: "England", scotland: "Scotland", wales: "Wales", "northern-ireland": "Northern Ireland" };
export function subdivisionName(code: string, locale: Locale): string | null {
  const slug = NATIONS[code.toUpperCase()];
  if (!slug) return null;
  return locale === "en" ? NATION_EN[slug] : SPECIAL[slug][locale];
}
