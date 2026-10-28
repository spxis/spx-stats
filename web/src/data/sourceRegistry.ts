// Generated from scripts/daily/sources.py by scripts/daily/sources_export.py; do not edit by hand.
// scripts/daily/sources_export.py --check and web/scripts/adminSources.test.ts check that this agrees with the registry.
// Admin only: read by /admin/sources and the run log, which answer 404 to anyone else.
export type SourceTier = "green" | "grey" | "red-confirm" | "red";
export interface SourceEntry {
  id: string;
  name: string;
  tier: SourceTier;
  reason: string;
  notes: string;
  evidence: string | null;
  leagues: string[];
  hosts: string[];
  keyNeeded: boolean;
  spacingSeconds: number | null;
  dailyCap: number | null;
  checkedOn: string | null;
  checkedBy: string | null;
}

export const SOURCE_REGISTRY: SourceEntry[] = [
  {
    "id": "wikipedia",
    "name": "English Wikipedia (club-season articles)",
    "tier": "green",
    "reason": "CC BY-SA 4.0 text; the API etiquette is one request at a time, a pause between requests, a User-Agent with contact details.",
    "notes": "",
    "evidence": "https://www.mediawiki.org/wiki/API:Etiquette",
    "leagues": [
      "nhl",
      "nba",
      "mlb",
      "nfl",
      "cfl"
    ],
    "hosts": [
      "en.wikipedia.org"
    ],
    "keyNeeded": false,
    "spacingSeconds": 1.0,
    "dailyCap": null,
    "checkedOn": "2026-10-12",
    "checkedBy": "John Morris (AGENTS.md section 3, scripts/daily/README.md sources table)"
  },
  {
    "id": "balldontlie",
    "name": "balldontlie (free tier: teams and games)",
    "tier": "green",
    "reason": "Free account; its terms allow storing and publishing the data. 5 requests a minute, so 13 s apart, one request at a time for NBA, MLB and NFL together.",
    "notes": "",
    "evidence": "https://docs.balldontlie.io",
    "leagues": [
      "nba",
      "mlb",
      "nfl"
    ],
    "hosts": [
      "api.balldontlie.io"
    ],
    "keyNeeded": true,
    "spacingSeconds": 13.0,
    "dailyCap": null,
    "checkedOn": "2026-10-12",
    "checkedBy": "John Morris"
  },
  {
    "id": "nflverse",
    "name": "nflverse games.csv (nflverse-data release 'schedules')",
    "tier": "green",
    "reason": "CC BY 4.0; one conditional file request.",
    "notes": "",
    "evidence": "https://github.com/nflverse/nflverse-data",
    "leagues": [
      "nfl"
    ],
    "hosts": [
      "github.com",
      "objects.githubusercontent.com",
      "release-assets.githubusercontent.com"
    ],
    "keyNeeded": false,
    "spacingSeconds": 2.0,
    "dailyCap": null,
    "checkedOn": "2026-10-12",
    "checkedBy": "John Morris (AGENTS.md section 3, scripts/daily/README.md sources table)"
  },
  {
    "id": "wikidata",
    "name": "Wikidata",
    "tier": "green",
    "reason": "CC0.",
    "notes": "",
    "evidence": "https://www.wikidata.org/wiki/Wikidata:Licensing",
    "leagues": [],
    "hosts": [
      "www.wikidata.org",
      "query.wikidata.org"
    ],
    "keyNeeded": false,
    "spacingSeconds": 1.0,
    "dailyCap": null,
    "checkedOn": "2026-10-19",
    "checkedBy": "John Morris, 2026-10-19 (ticket cmveuseuh0006kw069tlpou4d)"
  },
  {
    "id": "retrosheet",
    "name": "Retrosheet",
    "tier": "green",
    "reason": "Free to use with the credit notice.",
    "notes": "",
    "evidence": "https://www.retrosheet.org/notice.txt",
    "leagues": [
      "mlb"
    ],
    "hosts": [
      "www.retrosheet.org",
      "retrosheet.org"
    ],
    "keyNeeded": false,
    "spacingSeconds": 5.0,
    "dailyCap": null,
    "checkedOn": "2026-10-19",
    "checkedBy": "John Morris, 2026-10-19 (ticket cmveuseuh0006kw069tlpou4d)"
  },
  {
    "id": "lahman",
    "name": "Lahman baseball database",
    "tier": "green",
    "reason": "Open licence.",
    "notes": "",
    "evidence": "https://sabr.org/lahman-database/",
    "leagues": [
      "mlb"
    ],
    "hosts": [
      "sabr.org",
      "www.seanlahman.com"
    ],
    "keyNeeded": false,
    "spacingSeconds": 5.0,
    "dailyCap": null,
    "checkedOn": "2026-10-19",
    "checkedBy": "John Morris, 2026-10-19 (ticket cmveuseuh0006kw069tlpou4d)"
  },
  {
    "id": "osm",
    "name": "OpenStreetMap (Overpass API)",
    "tier": "green",
    "reason": "ODbL 1.0, credit '(c) OpenStreetMap contributors'; kept only in legacy_osm and core.brand_venue_osm.",
    "notes": "",
    "evidence": "https://www.openstreetmap.org/copyright",
    "leagues": [],
    "hosts": [
      "overpass-api.de",
      "www.openstreetmap.org"
    ],
    "keyNeeded": false,
    "spacingSeconds": 5.0,
    "dailyCap": null,
    "checkedOn": "2026-10-19",
    "checkedBy": "John Morris, 2026-10-19 (ticket cmveuseuh0006kw069tlpou4d)"
  },
  {
    "id": "cfbd",
    "name": "CollegeFootballData.com",
    "tier": "green",
    "reason": "Free API with a key.",
    "notes": "",
    "evidence": "https://collegefootballdata.com/",
    "leagues": [],
    "hosts": [
      "api.collegefootballdata.com"
    ],
    "keyNeeded": true,
    "spacingSeconds": 1.0,
    "dailyCap": null,
    "checkedOn": "2026-10-19",
    "checkedBy": "John Morris, 2026-10-19 (ticket cmveuseuh0006kw069tlpou4d)"
  },
  {
    "id": "odds_api",
    "name": "The Odds API",
    "tier": "green",
    "reason": "Free tier with a key.",
    "notes": "",
    "evidence": "https://the-odds-api.com/terms-and-conditions.html",
    "leagues": [],
    "hosts": [
      "api.the-odds-api.com"
    ],
    "keyNeeded": true,
    "spacingSeconds": 1.0,
    "dailyCap": null,
    "checkedOn": "2026-10-19",
    "checkedBy": "John Morris, 2026-10-19 (ticket cmveuseuh0006kw069tlpou4d)"
  },
  {
    "id": "hockeytech",
    "name": "HockeyTech feeds (lscluster.hockeytech.com), leagues other than the PWHL",
    "tier": "grey",
    "reason": "No terms found; backup or cross-check only, once a day and on manual request.",
    "notes": "Grey for leagues other than the PWHL only; any request naming the PWHL is red (pwhl_hockeytech). No terms found for the others. Tier set by John on 2026-10-19.",
    "evidence": null,
    "leagues": [
      "ahl",
      "echl"
    ],
    "hosts": [
      "lscluster.hockeytech.com"
    ],
    "keyNeeded": false,
    "spacingSeconds": 5.0,
    "dailyCap": 20,
    "checkedOn": null,
    "checkedBy": null
  },
  {
    "id": "cfl_api",
    "name": "api.cfl.ca",
    "tier": "grey",
    "reason": "No terms found; backup or cross-check only, once a day and on manual request.",
    "notes": "Tier set by John on 2026-10-19 (no terms found). Check 2026-10-25: the host does not answer (its DNS name points at a CloudFront name with no address); the CFL's API has needed a key issued by the CFL. The cfl.ca website terms forbid automated collection (cfl_ca is red). No parser until John has a working key and endpoint.",
    "evidence": null,
    "leagues": [
      "cfl"
    ],
    "hosts": [
      "api.cfl.ca"
    ],
    "keyNeeded": false,
    "spacingSeconds": 5.0,
    "dailyCap": 20,
    "checkedOn": null,
    "checkedBy": null
  },
  {
    "id": "ncaa_stats",
    "name": "stats.ncaa.org",
    "tier": "grey",
    "reason": "No terms found; backup or cross-check only, once a day and on manual request.",
    "notes": "No terms of use found for automated collection. Tier set by John on 2026-10-19; the clause and an evidence link are to be added by the terms check.",
    "evidence": null,
    "leagues": [],
    "hosts": [
      "stats.ncaa.org"
    ],
    "keyNeeded": false,
    "spacingSeconds": 5.0,
    "dailyCap": 20,
    "checkedOn": null,
    "checkedBy": null
  },
  {
    "id": "fangraphs",
    "name": "FanGraphs",
    "tier": "grey",
    "reason": "No terms found; backup or cross-check only, once a day and on manual request.",
    "notes": "Tier set by John on 2026-10-19 (no terms found). Terms check 2026-10-25: the Terms of Service section 17 says not to access the Service by any means other than the interface FanGraphs provides, and section 8 bars reusing the site's contents. John to decide whether this makes it red; no request is sent until he does.",
    "evidence": "https://www.fangraphs.com/about/terms-of-service",
    "leagues": [
      "mlb"
    ],
    "hosts": [
      "www.fangraphs.com",
      "fangraphs.com"
    ],
    "keyNeeded": false,
    "spacingSeconds": 5.0,
    "dailyCap": 20,
    "checkedOn": null,
    "checkedBy": null
  },
  {
    "id": "transfermarkt",
    "name": "Transfermarkt",
    "tier": "grey",
    "reason": "No terms found; backup or cross-check only, once a day and on manual request.",
    "notes": "Tier set by John on 2026-10-19 (no terms found). Terms check 2026-10-25: the terms page could not be read by the checking tool (fetch blocked); a person must read them before any request is sent.",
    "evidence": null,
    "leagues": [],
    "hosts": [
      "www.transfermarkt.com",
      "transfermarkt.com"
    ],
    "keyNeeded": false,
    "spacingSeconds": 5.0,
    "dailyCap": 20,
    "checkedOn": null,
    "checkedBy": null
  },
  {
    "id": "nhl_api",
    "name": "NHL API (confirm-only)",
    "tier": "red-confirm",
    "reason": "NHL.com's terms bar spidering, scraping and entering NHL content into a database.",
    "notes": "NHL.com's terms bar spidering, scraping and entering NHL content into a database. Confirm-only (John, 2026-10-19): read to confirm a result, never stored.",
    "evidence": null,
    "leagues": [],
    "hosts": [
      "api-web.nhle.com",
      "api.nhle.com",
      "statsapi.web.nhl.com"
    ],
    "keyNeeded": false,
    "spacingSeconds": 5.0,
    "dailyCap": 20,
    "checkedOn": null,
    "checkedBy": null
  },
  {
    "id": "mlb_statsapi",
    "name": "MLB statsapi (confirm-only)",
    "tier": "red-confirm",
    "reason": "MLB's notice bars automated use.",
    "notes": "MLB's notice bars automated use. Confirm-only (John, 2026-10-19): read to confirm a result, never stored.",
    "evidence": "http://gdx.mlb.com/components/copyright.txt",
    "leagues": [],
    "hosts": [
      "statsapi.mlb.com"
    ],
    "keyNeeded": false,
    "spacingSeconds": 5.0,
    "dailyCap": 20,
    "checkedOn": null,
    "checkedBy": null
  },
  {
    "id": "nba_stats",
    "name": "stats.nba.com (confirm-only)",
    "tier": "red-confirm",
    "reason": "NBA.com's terms forbid automated collection.",
    "notes": "NBA.com's terms forbid automated collection. Confirm-only (John, 2026-10-19): read to confirm a result, never stored.",
    "evidence": null,
    "leagues": [],
    "hosts": [
      "stats.nba.com"
    ],
    "keyNeeded": false,
    "spacingSeconds": 5.0,
    "dailyCap": 20,
    "checkedOn": null,
    "checkedBy": null
  },
  {
    "id": "wnba_stats",
    "name": "stats.wnba.com (confirm-only)",
    "tier": "red-confirm",
    "reason": "The WNBA Terms of Use (wnba.com, section 9) bar using NBA Statistics in connection with any website, product or service that features a database, the same clause as stats.nba.com. Was grey until John moved it on 2026-10-28.",
    "notes": "The WNBA Terms of Use (wnba.com, section 9) bar using NBA Statistics in connection with any website, product or service that features a database, the same clause as stats.nba.com. Was grey until John moved it on 2026-10-28. Confirm-only (John, 2026-10-28): read to confirm a result, never stored.",
    "evidence": "https://www.wnba.com/terms-of-use",
    "leagues": [
      "wnba"
    ],
    "hosts": [
      "stats.wnba.com"
    ],
    "keyNeeded": false,
    "spacingSeconds": 5.0,
    "dailyCap": 20,
    "checkedOn": null,
    "checkedBy": null
  },
  {
    "id": "pwhl_hockeytech",
    "name": "thepwhl.com and the PWHL HockeyTech feed (confirm-only)",
    "tier": "red-confirm",
    "reason": "The PWHL's terms forbid it; any HockeyTech request for the PWHL is this source.",
    "notes": "The PWHL's terms forbid it; any HockeyTech request for the PWHL is this source. Confirm-only (John, 2026-10-19): read to confirm a result, never stored.",
    "evidence": null,
    "leagues": [],
    "hosts": [
      "thepwhl.com",
      "www.thepwhl.com"
    ],
    "keyNeeded": false,
    "spacingSeconds": 5.0,
    "dailyCap": 20,
    "checkedOn": null,
    "checkedBy": null
  },
  {
    "id": "yahoo_sports",
    "name": "Yahoo Sports scoreboards (confirm-only)",
    "tier": "red-confirm",
    "reason": "Yahoo's Terms (section 2, member conduct) forbid it: \"access or collect data, or attempt to access or collect data, from our Services using any automated means, devices, programs, algorithms or methodologies, including but not limited to robots, spiders, scrapers, data mining tools, or data gathering or extraction tools, for any purpose without our express, prior permission.\" (read 2026-10-19).",
    "notes": "Yahoo's Terms (section 2, member conduct) forbid it: \"access or collect data, or attempt to access or collect data, from our Services using any automated means, devices, programs, algorithms or methodologies, including but not limited to robots, spiders, scrapers, data mining tools, or data gathering or extraction tools, for any purpose without our express, prior permission.\" (read 2026-10-19). Confirm-only (John, 2026-10-19): read to confirm a result, never stored.",
    "evidence": "https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html",
    "leagues": [
      "nhl",
      "nba",
      "mlb",
      "nfl"
    ],
    "hosts": [
      "sports.yahoo.com",
      "yahoo.com"
    ],
    "keyNeeded": false,
    "spacingSeconds": 8.0,
    "dailyCap": 20,
    "checkedOn": null,
    "checkedBy": null
  },
  {
    "id": "usatoday",
    "name": "USA TODAY Sports scoreboards (confirm-only)",
    "tier": "red-confirm",
    "reason": "USA TODAY's Terms of Service forbid it: \"use robots, spiders, scripts, code or any other automatic or manual device, tool or process to 'crawl', 'scrape', search or monitor this Site and/or access, retrieve or copy Content or related information\" (read 2026-10-19).",
    "notes": "USA TODAY's Terms of Service forbid it: \"use robots, spiders, scripts, code or any other automatic or manual device, tool or process to 'crawl', 'scrape', search or monitor this Site and/or access, retrieve or copy Content or related information\" (read 2026-10-19). Confirm-only (John, 2026-10-19): read to confirm a result, never stored.",
    "evidence": "https://cm.usatoday.com/terms/",
    "leagues": [
      "nhl",
      "nba",
      "mlb",
      "nfl"
    ],
    "hosts": [
      "sportsdata.usatoday.com",
      "www.usatoday.com",
      "usatoday.com"
    ],
    "keyNeeded": false,
    "spacingSeconds": 8.0,
    "dailyCap": 20,
    "checkedOn": null,
    "checkedBy": null
  },
  {
    "id": "nhl_com",
    "name": "nhl.com (the website)",
    "tier": "red",
    "reason": "AGENTS.md section 3: NHL.com's terms bar spidering, scraping and entering NHL content into a database.",
    "notes": "AGENTS.md section 3: NHL.com's terms bar spidering, scraping and entering NHL content into a database.",
    "evidence": null,
    "leagues": [],
    "hosts": [
      "nhl.com",
      "www.nhl.com"
    ],
    "keyNeeded": false,
    "spacingSeconds": null,
    "dailyCap": null,
    "checkedOn": null,
    "checkedBy": null
  },
  {
    "id": "mlb_com",
    "name": "mlb.com (the website)",
    "tier": "red",
    "reason": "AGENTS.md section 3: MLB's notice bars automated use.",
    "notes": "AGENTS.md section 3: MLB's notice bars automated use.",
    "evidence": "http://gdx.mlb.com/components/copyright.txt",
    "leagues": [],
    "hosts": [
      "mlb.com",
      "www.mlb.com"
    ],
    "keyNeeded": false,
    "spacingSeconds": null,
    "dailyCap": null,
    "checkedOn": null,
    "checkedBy": null
  },
  {
    "id": "nba_com",
    "name": "NBA.com and cdn.nba.com",
    "tier": "red",
    "reason": "AGENTS.md section 3: NBA.com's terms forbid automated collection.",
    "notes": "AGENTS.md section 3: NBA.com's terms forbid automated collection.",
    "evidence": null,
    "leagues": [],
    "hosts": [
      "nba.com",
      "www.nba.com",
      "cdn.nba.com"
    ],
    "keyNeeded": false,
    "spacingSeconds": null,
    "dailyCap": null,
    "checkedOn": null,
    "checkedBy": null
  },
  {
    "id": "nfl_com",
    "name": "NFL.com",
    "tier": "red",
    "reason": "AGENTS.md section 3: NFL.com's terms forbid automated collection.",
    "notes": "AGENTS.md section 3: NFL.com's terms forbid automated collection.",
    "evidence": null,
    "leagues": [],
    "hosts": [
      "nfl.com",
      "www.nfl.com"
    ],
    "keyNeeded": false,
    "spacingSeconds": null,
    "dailyCap": null,
    "checkedOn": null,
    "checkedBy": null
  },
  {
    "id": "cfl_ca",
    "name": "cfl.ca (the website)",
    "tier": "red",
    "reason": "AGENTS.md section 3: cfl.ca's terms forbid automated collection.",
    "notes": "AGENTS.md section 3: cfl.ca's terms forbid automated collection.",
    "evidence": null,
    "leagues": [],
    "hosts": [
      "cfl.ca",
      "www.cfl.ca"
    ],
    "keyNeeded": false,
    "spacingSeconds": null,
    "dailyCap": null,
    "checkedOn": null,
    "checkedBy": null
  },
  {
    "id": "espn",
    "name": "ESPN",
    "tier": "red",
    "reason": "AGENTS.md section 3: never use ESPN.",
    "notes": "AGENTS.md section 3: never use ESPN.",
    "evidence": "https://disneytermsofuse.com/",
    "leagues": [],
    "hosts": [
      "espn.com",
      "www.espn.com",
      "site.api.espn.com",
      "espncdn.com"
    ],
    "keyNeeded": false,
    "spacingSeconds": null,
    "dailyCap": null,
    "checkedOn": null,
    "checkedBy": null
  },
  {
    "id": "sports_reference",
    "name": "Sports Reference (hockey-, basketball-, baseball-, pro-football-reference, FBref)",
    "tier": "red",
    "reason": "AGENTS.md section 3: never use Sports Reference; its data-use page bars scraping.",
    "notes": "AGENTS.md section 3: never use Sports Reference; its data-use page bars scraping.",
    "evidence": "https://www.sports-reference.com/data_use.html",
    "leagues": [],
    "hosts": [
      "sports-reference.com",
      "hockey-reference.com",
      "basketball-reference.com",
      "baseball-reference.com",
      "pro-football-reference.com",
      "fbref.com",
      "www.fbref.com",
      "www.hockey-reference.com",
      "www.basketball-reference.com",
      "www.baseball-reference.com",
      "www.pro-football-reference.com"
    ],
    "keyNeeded": false,
    "spacingSeconds": null,
    "dailyCap": null,
    "checkedOn": null,
    "checkedBy": null
  },
  {
    "id": "news_tv",
    "name": "Newspapers and TV sites",
    "tier": "red",
    "reason": "AGENTS.md section 3: their terms forbid automated collection.",
    "notes": "AGENTS.md section 3: their terms forbid automated collection.",
    "evidence": null,
    "leagues": [],
    "hosts": [],
    "keyNeeded": false,
    "spacingSeconds": null,
    "dailyCap": null,
    "checkedOn": null,
    "checkedBy": null
  },
  {
    "id": "nwsl",
    "name": "nwslsoccer.com",
    "tier": "red",
    "reason": "Terms forbid automated collection.",
    "notes": "Terms forbid automated collection.",
    "evidence": null,
    "leagues": [],
    "hosts": [
      "nwslsoccer.com",
      "www.nwslsoccer.com"
    ],
    "keyNeeded": false,
    "spacingSeconds": null,
    "dailyCap": null,
    "checkedOn": null,
    "checkedBy": null
  },
  {
    "id": "cpl",
    "name": "cplsoccer.com",
    "tier": "red",
    "reason": "Terms forbid automated collection.",
    "notes": "Terms forbid automated collection.",
    "evidence": null,
    "leagues": [],
    "hosts": [
      "cplsoccer.com",
      "www.cplsoccer.com"
    ],
    "keyNeeded": false,
    "spacingSeconds": null,
    "dailyCap": null,
    "checkedOn": null,
    "checkedBy": null
  }
];
