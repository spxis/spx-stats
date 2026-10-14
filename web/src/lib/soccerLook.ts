import { seriesLooks, type Colours, type SideLook } from "./seriesLooks.ts";

/**
 * How a national team looks on a match page: its three-letter FIFA code and two colours taken from its flag (hex without #, the most telling first). The
 * archive's api.soccer_teams.fifa_code holds ISO 3166 alpha-3 codes for many teams (DZA, DEU, NLD, CHE, PRT...), which are not what FIFA writes (ALG, GER,
 * NED, SUI, POR), and the same code for the two Germanys and the two Congos, so the codes FIFA uses are kept here, by team id. Pure: no server code, so the
 * checks (scripts/soccer.test.ts) share it with the pages.
 *
 * The colours are the flag's, not the kit's, and two are given so that a pairing whose first colours are alike (two reds) moves the second side to its other
 * one (lib/seriesLooks.ts, which also keeps white and near-white panels out and every name at WCAG AA on its block).
 */
export const SOCCER_LOOK: Readonly<Record<string, readonly [abbr: string, primary: string, secondary: string]>> = {
  "T-01": ["ALG", "006233", "d21034"], // Algeria
  "T-02": ["ANG", "cc092f", "1a1a1a"], // Angola
  "T-03": ["ARG", "74acdf", "f6b40e"], // Argentina
  "T-04": ["AUS", "012169", "c8102e"], // Australia
  "T-05": ["AUT", "ed2939", "7a1420"], // Austria
  "T-06": ["BEL", "ed2939", "fdda24"], // Belgium
  "T-07": ["BOL", "d52b1e", "007934"], // Bolivia
  "T-08": ["BIH", "002f6c", "fecb00"], // Bosnia and Herzegovina
  "T-09": ["BRA", "009c3b", "002776"], // Brazil
  "T-10": ["BUL", "00966e", "d62612"], // Bulgaria
  "T-11": ["CMR", "007a5e", "ce1126"], // Cameroon
  "T-12": ["CAN", "d80621", "8c0a1c"], // Canada
  "X-cape-verde": ["CPV", "003893", "cf2027"],
  "T-13": ["CHI", "d52b1e", "0039a6"], // Chile
  "T-14": ["CHN", "de2910", "ffde00"], // China
  "T-15": ["TPE", "fe0000", "000095"], // Chinese Taipei
  "T-16": ["COL", "003893", "ce1126"], // Colombia
  "T-17": ["CRC", "002b7f", "ce1126"], // Costa Rica
  "T-18": ["CRO", "ff0000", "171796"], // Croatia
  "T-19": ["CUB", "002a8f", "cf142b"], // Cuba
  "X-curacao": ["CUW", "002b7f", "3a75c4"],
  "T-20": ["CZE", "d7141a", "11457e"], // Czech Republic
  "T-21": ["TCH", "d7141a", "11457e"], // Czechoslovakia
  "T-22": ["DEN", "c8102e", "7a0a1c"], // Denmark
  "X-dr-congo": ["COD", "007fff", "ce1021"],
  "T-23": ["DEI", "ae1c28", "21468b"], // Dutch East Indies
  "T-24": ["GDR", "dd0000", "000000"], // East Germany
  "T-25": ["ECU", "034ea2", "ed1c24"], // Ecuador
  "T-26": ["EGY", "ce1126", "000000"], // Egypt
  "T-27": ["SLV", "0f47af", "6c8fd1"], // El Salvador
  "T-28": ["ENG", "ce1124", "00247d"], // England
  "T-29": ["EQG", "3e9a00", "e32118"], // Equatorial Guinea
  "T-30": ["FRA", "0055a4", "ef4135"], // France
  "T-31": ["GER", "dd0000", "000000"], // Germany
  "T-32": ["GHA", "006b3f", "ce1126"], // Ghana
  "T-33": ["GRE", "0d5eaf", "6f9fd6"], // Greece
  "T-34": ["HAI", "00209f", "d21034"], // Haiti
  "T-35": ["HON", "0073cf", "6da6dd"], // Honduras
  "T-36": ["HUN", "cd2a3e", "436f4d"], // Hungary
  "T-37": ["ISL", "02529c", "dc1e35"], // Iceland
  "T-38": ["IRN", "239f40", "da0000"], // Iran
  "T-39": ["IRQ", "ce1126", "007a3d"], // Iraq
  "T-40": ["ISR", "0038b8", "6a91d9"], // Israel
  "T-41": ["ITA", "009246", "ce2b37"], // Italy
  "T-42": ["CIV", "f77f00", "009e60"], // Ivory Coast
  "T-43": ["JAM", "009b3a", "000000"], // Jamaica
  "T-44": ["JPN", "bc002d", "8a001f"], // Japan
  "X-jordan": ["JOR", "007a3d", "ce1126"],
  "T-45": ["KUW", "007a3d", "ce1126"], // Kuwait
  "T-46": ["MEX", "006847", "ce1126"], // Mexico
  "T-47": ["MAR", "c1272d", "006233"], // Morocco
  "T-48": ["NED", "ae1c28", "21468b"], // Netherlands
  "T-49": ["NZL", "00247d", "cc142b"], // New Zealand
  "T-50": ["NGA", "008751", "5cb88a"], // Nigeria
  "T-51": ["PRK", "024fa2", "ed1c27"], // North Korea
  "T-52": ["NIR", "ce1126", "00247d"], // Northern Ireland
  "T-53": ["NOR", "ba0c2f", "00205b"], // Norway
  "T-54": ["PAN", "d21034", "005293"], // Panama
  "T-55": ["PAR", "d52b1e", "0038a8"], // Paraguay
  "T-56": ["PER", "d91023", "8a0f1e"], // Peru
  "T-57": ["POL", "dc143c", "8a0d26"], // Poland
  "T-58": ["POR", "046a38", "da291c"], // Portugal
  "T-59": ["QAT", "8a1538", "5c0e25"], // Qatar
  "T-60": ["IRL", "169b62", "ff883e"], // Republic of Ireland
  "T-61": ["ROU", "002b7f", "ce1126"], // Romania
  "T-62": ["RUS", "0039a6", "d52b1e"], // Russia
  "T-63": ["KSA", "006c35", "4d9c72"], // Saudi Arabia
  "T-64": ["SCO", "0065bd", "003a73"], // Scotland
  "T-65": ["SEN", "00853f", "e31b23"], // Senegal
  "T-66": ["SRB", "c6363c", "0c4076"], // Serbia
  "T-67": ["SCG", "c6363c", "0c4076"], // Serbia and Montenegro
  "T-68": ["SVK", "0b4ea2", "ee1c25"], // Slovakia
  "T-69": ["SVN", "005da4", "ed1c24"], // Slovenia
  "T-70": ["RSA", "007749", "de3831"], // South Africa
  "T-71": ["KOR", "cd2e3a", "0047a0"], // South Korea
  "T-72": ["URS", "cc0000", "8a0000"], // Soviet Union
  "T-73": ["ESP", "c60b1e", "ffc400"], // Spain
  "T-74": ["SWE", "006aa7", "fecc00"], // Sweden
  "T-75": ["SUI", "d52b1e", "8a1a10"], // Switzerland
  "T-76": ["THA", "a51931", "2d2a4a"], // Thailand
  "T-77": ["TOG", "006a4e", "d21034"], // Togo
  "T-78": ["TRI", "ce1126", "1a1a1a"], // Trinidad and Tobago
  "T-79": ["TUN", "e70013", "8a0a12"], // Tunisia
  "T-80": ["TUR", "e30a17", "8a0a10"], // Turkey
  "T-81": ["UKR", "0057b7", "ffd700"], // Ukraine
  "T-82": ["UAE", "00732f", "ff0000"], // United Arab Emirates
  "T-83": ["USA", "0a3161", "b31942"], // United States
  "T-84": ["URU", "0038a8", "75aadb"], // Uruguay
  "X-uzbekistan": ["UZB", "0099b5", "1eb53a"],
  "T-85": ["WAL", "c8102e", "00712d"], // Wales
  "T-86": ["FRG", "dd0000", "000000"], // West Germany
  "T-87": ["YUG", "0c4076", "c6363c"], // Yugoslavia
  "T-88": ["ZAI", "1f8f3a", "dc241f"], // Zaire
};

/** A team's three-letter FIFA code: the table's, else the first three letters of its name. */
export function soccerAbbr(teamId: string, name: string): string {
  return SOCCER_LOOK[teamId]?.[0] ?? name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
}

const flagColours = (teamId: string): Colours | null => {
  const t = SOCCER_LOOK[teamId];
  return t ? { primary_hex: t[1], secondary_hex: t[2] } : null;
};

/** The two national teams' looks, the first team's colours kept and the second moved when they are alike (the same rules as a playoff series). */
export function soccerLooks(a: string, b: string): [SideLook, SideLook] {
  return seriesLooks("soccer", flagColours(a), flagColours(b));
}

/** Two clubs without colours on record (MLS: the archive holds none) get the neutral pair, never a guess at a club's colours. */
export function neutralLooks(): [SideLook, SideLook] {
  return seriesLooks("mls", { primary_hex: "5d6874" }, { primary_hex: "b07a12" });
}

/** MLS clubs' short names, by team id (the league's own, as a score line writes them). */
const CLUB_ABBR: Readonly<Record<string, string>> = {
  "C-atlanta-united-fc": "ATL", "C-austin-fc": "ATX", "C-cf-montreal": "MTL", "C-charlotte-fc": "CLT", "C-chicago-fire-fc": "CHI", "C-chivas-usa": "CHV",
  "C-colorado-rapids": "COL", "C-columbus-crew": "CLB", "C-dc-united": "DCU", "C-fc-cincinnati": "CIN", "C-fc-dallas": "DAL", "C-houston-dynamo-fc": "HOU",
  "C-inter-miami-cf": "MIA", "C-la-galaxy": "LAG", "C-los-angeles-fc": "LAFC", "C-miami-fusion": "MIF", "C-minnesota-united-fc": "MIN", "C-nashville-sc": "NSH",
  "C-new-england-revolution": "NER", "C-new-york-city-fc": "NYC", "C-new-york-red-bulls": "NYRB", "C-orlando-city-sc": "ORL", "C-philadelphia-union": "PHI",
  "C-portland-timbers": "POR", "C-real-salt-lake": "RSL", "C-san-diego-fc": "SD", "C-san-jose-earthquakes": "SJ", "C-seattle-sounders-fc": "SEA",
  "C-sporting-kansas-city": "SKC", "C-st-louis-city-sc": "STL", "C-tampa-bay-mutiny": "TBM", "C-toronto-fc": "TOR", "C-vancouver-whitecaps-fc": "VAN",
};

/** A club's short name for its monogram and the strip: the table's, else the first three letters of its name. */
export function clubAbbr(teamId: string, name: string): string {
  return CLUB_ABBR[teamId] ?? name.normalize("NFD").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
}
