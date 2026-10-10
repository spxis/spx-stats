-- Team colours and logo files as Wikidata (CC0) and Wikimedia Commons answered,
-- one row per team item. core.franchise_brand is built from these by
-- db/build/175_team_brand.sql, because core is rebuilt with new franchise ids.
create schema if not exists legacy_team_brand;
comment on schema legacy_team_brand is 'Team items, colours and logo files from Wikidata (CC0) and Wikimedia Commons (licence per file).';

create table if not exists legacy_team_brand.team (
  league_code text not null,
  qid         text not null,
  label       text,
  inception   date,
  dissolved   date,
  fetched_on  date not null,
  primary key (league_code, qid)
);
create table if not exists legacy_team_brand.team_colour (
  qid          text not null,
  ordinal      integer not null,      -- position among the team's colours (P1545, else listing order)
  colour_qid   text not null,
  colour_label text,
  hex          text check (hex ~ '^[0-9A-F]{6}$'),
  rank         text,
  primary key (qid, ordinal, colour_qid)
);
create table if not exists legacy_team_brand.team_logo (
  qid          text not null,
  file         text not null,          -- Commons file name, without the File: prefix
  starts_on    date,
  ends_on      date,
  rank         text,
  thumb_url    text,                   -- upload.wikimedia.org, 120 px
  file_url     text,
  page_url     text,                   -- the file's Commons page
  licence      text,                   -- LicenseShortName from Commons
  licence_code text,
  restrictions text,                   -- e.g. trademarked
  primary key (qid, file)
);

insert into meta.source (code, name, kind, licence, attribution, url)
values ('wikimedia_commons', 'Wikimedia Commons', 'dataset', 'Per file: see each file''s page',
        'Logos and images from Wikimedia Commons (commons.wikimedia.org), licence per file.', 'https://commons.wikimedia.org')
on conflict (code) do nothing;

-- Home venue (P115, dated), headquarters (P159) and located-in place (P131) of a
-- team, each with its label and P625 coordinate.
create table if not exists legacy_team_brand.team_place (
  qid        text not null,
  kind       text not null check (kind in ('home_venue', 'headquarters', 'located_in')),
  place_qid  text not null,
  label      text,
  latitude   numeric(8,5),
  longitude  numeric(8,5),
  starts_on  date,
  ends_on    date,
  rank       text,
  primary key (qid, kind, place_qid)
);
