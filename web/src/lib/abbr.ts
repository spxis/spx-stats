/**
 * Official team abbreviations, era by era.
 *
 * The API's views do not carry core.franchise_identity.abbreviation yet, so this is a snapshot of that column for the
 * NHL, MLB and NFL (taken 2026-10-10). The NBA and CFL columns are empty in the database; their entries here are the
 * leagues' usual abbreviations, written in by hand. When a view exposes `abbreviation`, read it and delete this file.
 *
 * Each franchise lists [first season, abbreviation] pairs; a season takes the latest pair that has started, and a
 * season before the first pair takes the first. MLB's two-league-city codes (NYN, CHN, SLN...) are shown the way fans
 * write them (NYM, CHC, STL...) through ALIAS.
 */
type Eras = [number, string][];

const NHL: Record<number, Eras> = {
  1403: [[1993, "ANA"]], 1404: [[1999, "ATL"], [2011, "WPG"]], 1405: [[1924, "BOS"]], 1406: [[1970, "BUF"]],
  1407: [[1972, "AFM"], [1980, "CGY"]], 1408: [[1979, "HFD"], [1997, "CAR"]], 1409: [[1926, "CHI"]],
  1410: [[1979, "QUE"], [1995, "COL"]], 1411: [[1967, "MNS"], [1993, "DAL"]],
  1412: [[1926, "DCG"], [1930, "DFL"], [1932, "DET"]], 1413: [[1979, "EDM"]], 1414: [[1993, "FLA"]], 1415: [[1967, "LAK"]],
  1416: [[1917, "MTL"]], 1417: [[1998, "NSH"]], 1418: [[1974, "KCS"], [1976, "CLR"], [1982, "NJD"]], 1419: [[1972, "NYI"]],
  1420: [[1926, "NYR"]], 1421: [[1992, "OTT"]], 1422: [[1967, "PHI"]],
  1423: [[1979, "WIN"], [1996, "PHX"], [2014, "ARI"], [2024, "UTA"]], 1424: [[1967, "PIT"]], 1425: [[1991, "SJS"]],
  1426: [[1967, "STL"]], 1427: [[1992, "TBL"]], 1428: [[1917, "TAN"], [1919, "TSP"], [1927, "TOR"]], 1429: [[1970, "VAN"]],
  1430: [[1974, "WSH"]], 1490: [[2000, "CBJ"]], 1491: [[2000, "MIN"]],
  1634: [[1967, "OAK"], [1970, "CGS"], [1976, "CLE"]], 1635: [[1924, "MMR"]], 1636: [[1925, "PIR"], [1930, "QUA"]],
  1637: [[1917, "SEN"], [1934, "SLE"]], 1638: [[2017, "VGK"]],
  1639: [[1919, "QBD"], [1920, "HAM"], [1925, "NYA"], [1941, "BRK"]], 1640: [[1917, "MWN"]], 1641: [[2021, "SEA"]],
};

const NFL: Record<number, Eras> = {
  1492: [[1999, "BUF"]], 1493: [[1999, "MIA"]], 1494: [[1999, "NE"]], 1495: [[1999, "NYJ"]], 1496: [[1999, "CIN"]],
  1497: [[1999, "CLE"]], 1498: [[1999, "PIT"]], 1499: [[1999, "BAL"]], 1500: [[1999, "TEN"]], 1501: [[1999, "IND"]],
  1502: [[1999, "JAX"]], 1503: [[1999, "HOU"]], 1504: [[1999, "DEN"]], 1505: [[1999, "KC"]],
  1506: [[1999, "OAK"], [2020, "LV"]], 1507: [[1999, "SD"], [2017, "LAC"]], 1508: [[1999, "DAL"]], 1509: [[1999, "NYG"]],
  1510: [[1999, "PHI"]], 1511: [[1999, "WAS"]], 1512: [[1999, "CHI"]], 1513: [[1999, "DET"]], 1514: [[1999, "GB"]],
  1515: [[1999, "MIN"]], 1516: [[1999, "ATL"]], 1517: [[1999, "NO"]], 1518: [[1999, "TB"]], 1519: [[1999, "CAR"]],
  1520: [[1999, "STL"], [2016, "LA"]], 1521: [[1999, "ARI"]], 1522: [[1999, "SF"]], 1523: [[1999, "SEA"]],
};

const MLB: Record<number, Eras> = {
  1460: [[1961, "LAA"], [1965, "CAL"], [1997, "ANA"]], 1461: [[1998, "ARI"]],
  1462: [[1871, "BS1"], [1876, "BSN"], [1953, "MLN"], [1966, "ATL"]], 1463: [[1901, "MLA"], [1902, "SLA"], [1954, "BAL"]],
  1464: [[1901, "BOS"]], 1465: [[1871, "CH1"], [1874, "CH2"], [1876, "CHN"]], 1466: [[1901, "CHA"]],
  1467: [[1882, "CN2"], [1890, "CIN"]], 1468: [[1901, "CLE"]], 1469: [[1993, "COL"]], 1470: [[1901, "DET"]],
  1471: [[1993, "FLO"], [2012, "MIA"]], 1472: [[1962, "HOU"]], 1473: [[1969, "KCA"]],
  1474: [[1884, "BR3"], [1888, "BR4"], [1890, "BRO"], [1958, "LAN"]], 1475: [[1969, "SE1"], [1970, "MIL"]],
  1476: [[1901, "WS1"], [1961, "MIN"]], 1477: [[1969, "MON"], [2005, "WAS"]], 1478: [[1962, "NYN"]],
  1479: [[1901, "BLA"], [1903, "NYA"]], 1480: [[1901, "PHA"], [1955, "KC1"], [1968, "OAK"], [2025, "ATH"]],
  1481: [[1883, "PHI"]], 1482: [[1882, "PT1"], [1887, "PIT"]], 1483: [[1969, "SDN"]], 1484: [[1883, "NY1"], [1958, "SFN"]],
  1485: [[1977, "SEA"]], 1486: [[1882, "SLN"]], 1487: [[1998, "TBA"]], 1488: [[1961, "WS2"], [1972, "TEX"]], 1489: [[1977, "TOR"]],
};

const NBA: Record<number, Eras> = {
  1431: [[2002, "ATL"]], 1432: [[2002, "BOS"]], 1433: [[2002, "NOH"]], 1434: [[2002, "CHI"]], 1435: [[2002, "CLE"]],
  1436: [[2002, "DAL"]], 1437: [[2002, "DEN"]], 1438: [[2002, "DET"]], 1439: [[2002, "GSW"]], 1440: [[2002, "HOU"]],
  1441: [[2002, "IND"]], 1442: [[2002, "LAC"]], 1443: [[2002, "LAL"]], 1444: [[2002, "MIA"]], 1445: [[2002, "MIL"]],
  1446: [[2002, "MIN"]], 1447: [[2002, "NJN"], [2012, "BKN"]], 1448: [[2002, "NYK"]], 1449: [[2002, "ORL"]],
  1450: [[2002, "PHI"]], 1451: [[2002, "PHX"]], 1452: [[2002, "POR"]], 1453: [[2002, "SAC"]], 1454: [[2002, "SAS"]],
  1455: [[2002, "SEA"], [2008, "OKC"]], 1456: [[2002, "TOR"]], 1457: [[2002, "UTA"]], 1458: [[2002, "MEM"]],
  1459: [[2002, "WAS"]], 1533: [[2004, "CHA"]],
};

const CFL: Record<number, Eras> = {
  1524: [[2002, "MTL"]], 1525: [[2002, "HAM"]], 1526: [[2002, "OTT"]], 1527: [[2002, "TOR"]], 1528: [[2002, "WPG"]],
  1529: [[2002, "EDM"]], 1530: [[2002, "SSK"]], 1531: [[2002, "CGY"]], 1532: [[2002, "BC"]],
};

const BY_LEAGUE: Record<string, Record<number, Eras>> = { nhl: NHL, nfl: NFL, mlb: MLB, nba: NBA, cfl: CFL };

const ALIAS: Record<string, string> = {
  NYN: "NYM", NYA: "NYY", CHN: "CHC", CHA: "CWS", SLN: "STL", SDN: "SD", SFN: "SF", LAN: "LAD", KCA: "KC", TBA: "TB",
};

/** The abbreviation of a franchise in a season, or null when none is known (a defunct nineteenth-century club). */
export function officialAbbr(lg: string, f: number | null | undefined, year?: number): string | null {
  if (f == null) return null;
  const eras = BY_LEAGUE[lg]?.[f];
  if (!eras?.length) return null;
  const era = (year != null ? [...eras].reverse().find(([from]) => from <= year) : null) ?? (year != null ? eras[0] : eras.at(-1)!);
  const code = era[1];
  return lg === "mlb" ? ALIAS[code] ?? code : code;
}

/** The abbreviation for tight places: the official one, else the first letters of the name (never longer than four). */
export function abbrFor(lg: string, f: number | null | undefined, year: number | undefined, name: string | null | undefined): string {
  const a = officialAbbr(lg, f, year);
  if (a) return a;
  const words = String(name || "").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.map((w) => w[0]).join("") : words[0] ?? "—").slice(0, 4).toUpperCase();
}
