-- The article names of the parent clubs a minor-league club was affiliated with in a season, next to the abbreviations the standings print (migration 158): "Detroit Red Wings/San Jose Sharks"
-- for "DET/SJS". An abbreviation can fit two clubs ("TB", "LA", "WAS", "MON", "ARZ"); the article a standings cell links to names exactly one. Filled for the ECHL (db/build/233).
-- Add-only, rerunnable. DS1 only: legacy schemas are not published to production.
alter table legacy_wikipedia_hockey_minor.team_season add column if not exists affiliation_links text;
