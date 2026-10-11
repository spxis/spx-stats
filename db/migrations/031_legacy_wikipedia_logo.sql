-- Logos of teams Wikidata (P154) has none for: the image of the team's English Wikipedia article, which is the
-- infobox logo. Most are non-free files uploaded to English Wikipedia (shown small, as fair use, see /logos).
-- Loaded by scripts/wikidata/team_logos_wikipedia.py; the raw answers are in legacy_files.raw_archive under
-- 'wikipedia-logos/<date>/'. core.franchise_brand takes them in db/build/175_team_brand.sql.
create schema if not exists legacy_team_brand;
create table if not exists legacy_team_brand.wikipedia_logo (
  qid         text primary key,
  league_code text not null,
  title       text not null,      -- the English Wikipedia article
  file        text not null,      -- File: name of the article's image
  thumb_url   text not null,
  file_url    text,
  page_url    text not null,      -- the file's description page
  licence     text not null,
  non_free    boolean not null,
  fetched_on  date not null
);
