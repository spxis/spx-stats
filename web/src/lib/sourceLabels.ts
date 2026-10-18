/**
 * The short chip, full name, licence and link of each data source code (meta.source.code) the people list shows. A code not listed is drawn
 * as its first four letters in capitals with the code as its name.
 */
export interface SourceLabel {
  short: string;
  name: string;
  licence: string;
  url: string;
}

const SOURCE_LABELS: Record<string, SourceLabel> = {
  editorial: { short: "ED", name: "spx-stats editorial", licence: "", url: "" },
  jfjelstul_worldcup: { short: "WCDB", name: "World Cup Database (Joshua Fjelstul)", licence: "CC BY-SA 4.0", url: "https://github.com/jfjelstul/worldcup" },
  lahman: { short: "LAH", name: "Lahman Baseball Database", licence: "CC BY-SA 3.0", url: "https://sabr.org/lahman-database/" },
  nflverse: { short: "NFLV", name: "nflverse", licence: "CC BY 4.0", url: "https://github.com/nflverse/nfldata" },
  nhl_api: { short: "NHL", name: "NHL", licence: "", url: "https://api-web.nhle.com" },
  retrosheet: { short: "RS", name: "Retrosheet", licence: "Free for any use, with Retrosheet's notice shown", url: "https://www.retrosheet.org" },
  spx_database: { short: "SPX", name: "SPX (SportsInteractive.com) database", licence: "Owned by SPX", url: "" },
  spx_files: { short: "SPXF", name: "SPX published files", licence: "Owned by SPX", url: "" },
  spx_stats_derived: { short: "DRV", name: "Worked out by spx-stats", licence: "", url: "" },
  spxn_database: { short: "SPXN", name: "spxn.com store", licence: "Owned by SPX", url: "" },
  wikidata: { short: "WD", name: "Wikidata", licence: "CC0 1.0", url: "https://www.wikidata.org" },
  wikidata_meigen: { short: "WDM", name: "Wikidata (quotations)", licence: "CC0 1.0", url: "https://www.wikidata.org" },
  wikimedia_commons: { short: "WMC", name: "Wikimedia Commons", licence: "Per file", url: "https://commons.wikimedia.org" },
  wikipedia: { short: "WP", name: "Wikipedia", licence: "CC BY-SA 4.0", url: "https://en.wikipedia.org" },
};

export function sourceLabel(code: string): SourceLabel {
  return SOURCE_LABELS[code] ?? { short: code.replaceAll("_", "").slice(0, 4).toUpperCase(), name: code.replaceAll("_", " "), licence: "", url: "" };
}
