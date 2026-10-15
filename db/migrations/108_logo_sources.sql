-- Team logos beyond the Wikidata ones: the Wikimedia Commons sweep (every free logo of a club or name era, licence per file) and
-- SportsLogos.Net (marks Commons does not hold, shown small under fair use, kept as downloaded). Add only; rerunnable. DS1 first.
--   legacy_team_brand.commons_logo  one row per Commons file the sweep read (scripts/logos/commons_sweep.py, commons_load.py)
--   legacy_sportslogos.team / logo  one row per SportsLogos.Net team page and per logo on it (scripts/logos/sportslogos_fetch.py,
--                                   sportslogos_load.py); the page HTML and each image are kept byte for byte in legacy_files.raw_archive
-- core.franchise_brand is filled from these by db/build/176_team_logo_extra.sql, from the assignments in db/seed/logo_extra.csv.
-- Nothing here is published by itself: the legacy_* tables stay on DS1; production gets the core.franchise_brand rows and the
-- 'sportslogos' meta.source row through a data release.

insert into meta.source (code, name, kind, licence, attribution, url, notes)
values ('sportslogos', 'SportsLogos.Net', 'website', 'Fair use: shown small to identify the team; the marks belong to their owners',
        'Logo images from SportsLogos.Net (sportslogos.net). SportsLogos.Net does not own the logos and grants no rights in them.',
        'https://www.sportslogos.net',
        'Historic team marks Wikimedia Commons does not hold. Their terms: research, educational and historical use, credit and link back, no commercial use. Fetched one request at a time, at least 5 s apart; robots.txt allows /logos/. Images are kept as downloaded (no upscaling, no vectorising) and served from our own files, never hotlinked.')
on conflict (code) do nothing;

create schema if not exists legacy_team_brand;
create table if not exists legacy_team_brand.commons_logo (
  file          text primary key,        -- Commons file name, without the File: prefix, spaces as underscores
  page_url      text not null,           -- the file's Commons page
  file_url      text not null,           -- the original on upload.wikimedia.org
  thumb_url     text,                    -- 250 px rendering
  mime          text,
  width         integer,
  height        integer,
  bytes         integer,
  licence       text,                    -- LicenseShortName from the file page
  licence_class text not null check (licence_class in ('pd', 'free', 'non-free', 'unknown')),   -- pd: public domain, CC0, PD-textlogo and the like; free: CC BY, CC BY-SA
  restrictions  text,                    -- e.g. trademarked
  categories    text,
  years_from    integer,                 -- the years the file's title, description or categories name
  years_to      integer,
  fetched_on    date not null
);
comment on table legacy_team_brand.commons_logo is 'Logo files of clubs and name eras found on Wikimedia Commons by the sweep, with the licence each file page gives.';

create schema if not exists legacy_sportslogos;
comment on schema legacy_sportslogos is 'SportsLogos.Net team pages and the logo images on them; DS1 only. Fair use, shown small; see meta.source sportslogos.';

create table if not exists legacy_sportslogos.team (
  sl_team_id   integer primary key,                        -- the number in /logos/list_by_team/<id>/<slug>/
  league_name  text,
  name         text not null,
  page_url     text not null unique,                       -- also the source_key of the brand rows built from it
  archive_name text references legacy_files.raw_archive(name),   -- the team page as received
  fetched_on   date not null
);
create table if not exists legacy_sportslogos.logo (
  sl_logo_key  text primary key,                           -- the key in /logos/view/<key>/...
  sl_team_id   integer not null references legacy_sportslogos.team(sl_team_id),
  page_url     text not null unique,                       -- the logo's own page: the source_key of the brand rows built from it
  title        text not null,                              -- e.g. 'Vancouver Millionaires Primary Logo (1915 - 1922)'
  kind         text not null,                              -- Primary, Jersey, Secondary, Wordmark, ...
  year_from    integer,
  year_to      integer,
  image_url    text not null,                              -- where it was downloaded from (never shown to readers)
  archive_name text references legacy_files.raw_archive(name),   -- the image bytes as received
  sha256       text,
  mime         text,
  width        integer,
  height       integer,
  bytes        integer,
  hosted_path  text,                                       -- where the site serves it from: /team-logos/sl/<key>.<ext>
  fetched_on   date not null
);
comment on table legacy_sportslogos.logo is 'One logo of a SportsLogos.Net team page: its years, its kind, the downloaded image (raw_archive) and the path the site serves it from.';
