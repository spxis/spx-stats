-- Generated from scripts/daily/sources.py by scripts/daily/sources_export.py; do not edit by hand.
-- Sets the tier, the terms note and the evidence link on the meta.source rows the registry names (a code with no row yet is skipped:
-- the migration that adds a source sets its own tier). Rerunnable; touches nothing else. The grey-area report reads meta.source.tier
-- (api.grey_only_rows, db/review/grey_only_rows.sql). meta.source reaches production in a data release.
update meta.source s set tier = v.tier, terms_note = v.terms_note, evidence_url = v.evidence_url
from (values
  ('wikipedia', 'green', 'Text is CC BY-SA 4.0 (credit and share-alike); MediaWiki API etiquette: one request at a time, maxlag, descriptive User-Agent.', 'https://www.mediawiki.org/wiki/API:Etiquette'),
  ('wikipedia_daily', 'green', 'Text is CC BY-SA 4.0 (credit and share-alike); MediaWiki API etiquette: one request at a time, maxlag, descriptive User-Agent.', 'https://www.mediawiki.org/wiki/API:Etiquette'),
  ('wikipedia_mls', 'green', 'Text is CC BY-SA 4.0 (credit and share-alike); MediaWiki API etiquette: one request at a time, maxlag, descriptive User-Agent.', 'https://www.mediawiki.org/wiki/API:Etiquette'),
  ('balldontlie', 'green', 'Terms allow storing and publishing the data (credit ''NBA schedule and scores from balldontlie.io''); free tier endpoints teams and games only.', 'https://docs.balldontlie.io'),
  ('nflverse', 'green', 'CC BY 4.0; credit ''NFL data from nflverse (github.com/nflverse), CC BY 4.0.''', 'https://github.com/nflverse/nflverse-data'),
  ('wikidata', 'green', 'CC0 1.0 (AGENTS.md section 3).', 'https://www.wikidata.org/wiki/Wikidata:Licensing'),
  ('wikidata_rosters', 'green', 'CC0 1.0 (AGENTS.md section 3).', 'https://www.wikidata.org/wiki/Wikidata:Licensing'),
  ('wikidata_meigen', 'green', 'CC0 1.0 (AGENTS.md section 3).', 'https://www.wikidata.org/wiki/Wikidata:Licensing'),
  ('retrosheet', 'green', 'Credit notice required (AGENTS.md section 3).', 'https://www.retrosheet.org/notice.txt'),
  ('lahman', 'green', 'Lahman (AGENTS.md section 3).', 'https://sabr.org/lahman-database/'),
  ('openstreetmap', 'green', 'ODbL 1.0 (AGENTS.md section 3).', 'https://www.openstreetmap.org/copyright'),
  ('cfbd', 'green', 'One free key (never create a second); 1,000 requests a calendar month, shared with the basketball API. Fetch through scripts/grey/cfbd_fetch.py (monthly budget and request log). Never expose the raw responses or the legacy_cfbd tables as a download.', 'https://collegefootballdata.com/terms'),
  ('odds_api', 'green', 'Seeded green by John 2026-10-19; a key is needed.', 'https://the-odds-api.com/terms-and-conditions.html'),
  ('hockeytech', 'grey', 'Grey for leagues other than the PWHL only; any request naming the PWHL is red (pwhl_hockeytech). No terms found for the others. Tier set by John on 2026-10-19.', null),
  ('cfl_api', 'grey', 'Tier set by John on 2026-10-19 (no terms found). Check 2026-10-25: the host does not answer (its DNS name points at a CloudFront name with no address); the CFL''s API has needed a key issued by the CFL. The cfl.ca website terms forbid automated collection (cfl_ca is red). No parser until John has a working key and endpoint.', null),
  ('ncaa_stats', 'grey', 'No terms of use found for automated collection. Tier set by John on 2026-10-19; the clause and an evidence link are to be added by the terms check.', null),
  ('fangraphs', 'grey', 'Tier set by John on 2026-10-19 (no terms found). Terms check 2026-10-25: the Terms of Service section 17 says not to access the Service by any means other than the interface FanGraphs provides, and section 8 bars reusing the site''s contents. John to decide whether this makes it red; no request is sent until he does.', 'https://www.fangraphs.com/about/terms-of-service'),
  ('transfermarkt', 'grey', 'Tier set by John on 2026-10-19 (no terms found). Terms check 2026-10-25: the terms page could not be read by the checking tool (fetch blocked); a person must read them before any request is sent.', null),
  ('nhl_api', 'red-confirm', 'NHL.com''s terms bar spidering, scraping and entering NHL content into a database. Confirm-only (John, 2026-10-19): read to confirm a result, never stored.', null),
  ('mlb_statsapi', 'red-confirm', 'MLB''s notice bars automated use. Confirm-only (John, 2026-10-19): read to confirm a result, never stored.', 'http://gdx.mlb.com/components/copyright.txt'),
  ('nba_stats', 'red-confirm', 'NBA.com''s terms forbid automated collection. Confirm-only (John, 2026-10-19): read to confirm a result, never stored.', null),
  ('wnba_stats', 'red-confirm', 'The WNBA Terms of Use (wnba.com, section 9) bar using NBA Statistics in connection with any website, product or service that features a database, the same clause as stats.nba.com. Was grey until John moved it on 2026-10-28. Confirm-only (John, 2026-10-28): read to confirm a result, never stored.', 'https://www.wnba.com/terms-of-use'),
  ('pwhl_hockeytech', 'red-confirm', 'The PWHL''s terms forbid it; any HockeyTech request for the PWHL is this source. Confirm-only (John, 2026-10-19): read to confirm a result, never stored.', null),
  ('yahoo_sports', 'red-confirm', 'Yahoo''s Terms (section 2, member conduct) forbid it: "access or collect data, or attempt to access or collect data, from our Services using any automated means, devices, programs, algorithms or methodologies, including but not limited to robots, spiders, scrapers, data mining tools, or data gathering or extraction tools, for any purpose without our express, prior permission." (read 2026-10-19). Confirm-only (John, 2026-10-19): read to confirm a result, never stored.', 'https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html'),
  ('usatoday', 'red-confirm', 'USA TODAY''s Terms of Service forbid it: "use robots, spiders, scripts, code or any other automatic or manual device, tool or process to ''crawl'', ''scrape'', search or monitor this Site and/or access, retrieve or copy Content or related information" (read 2026-10-19). Confirm-only (John, 2026-10-19): read to confirm a result, never stored.', 'https://cm.usatoday.com/terms/'),
  ('nhl_com', 'red', 'AGENTS.md section 3: NHL.com''s terms bar spidering, scraping and entering NHL content into a database.', null),
  ('mlb_com', 'red', 'AGENTS.md section 3: MLB''s notice bars automated use.', 'http://gdx.mlb.com/components/copyright.txt'),
  ('nba_com', 'red', 'AGENTS.md section 3: NBA.com''s terms forbid automated collection.', null),
  ('nfl_com', 'red', 'AGENTS.md section 3: NFL.com''s terms forbid automated collection.', null),
  ('cfl_ca', 'red', 'AGENTS.md section 3: cfl.ca''s terms forbid automated collection.', null),
  ('espn', 'red', 'AGENTS.md section 3: never use ESPN.', 'https://disneytermsofuse.com/'),
  ('sports_reference', 'red', 'AGENTS.md section 3: never use Sports Reference; its data-use page bars scraping.', 'https://www.sports-reference.com/data_use.html'),
  ('news_tv', 'red', 'AGENTS.md section 3: their terms forbid automated collection.', null),
  ('nwsl', 'red', 'Terms forbid automated collection.', null),
  ('cpl', 'red', 'Terms forbid automated collection.', null)
) as v(code, tier, terms_note, evidence_url)
where s.code = v.code
  and (s.tier is distinct from v.tier or s.terms_note is distinct from v.terms_note or s.evidence_url is distinct from v.evidence_url);
