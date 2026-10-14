-- Surface and roof of a home venue BY PERIOD, a fixed list of surfaces, whether a venue is still open, and the legacy columns that feed them.
-- Add-only (nothing is dropped or renamed; api.venue_info keeps its columns and gains two at the end). Apply to DS1, then to production with the
-- Supabase MCP apply_migration, before the data release that fills the tables (core.brand_venue_period, core.brand_venue_info, ref.venue_surface,
-- ref.venue_surface_rule). The guarded block at the end changes legacy_wikidata_venues, which exists on DS1 and the working copy only.
--
-- Surface: ref.venue_surface is the small fixed list (grass, artificial, hybrid, ice, wood, multi, other). ref.venue_surface_rule is the map from the
-- text a source gives ("AstroTurf 3D Xtreme", "Kentucky bluegrass", "Ice / Parquet floor") to that list: the first rule, by rank, whose
-- case-insensitive pattern finds the text wins (db/seed/venue_surface_rule.csv, filled by db/build/193_venue_names.sql). A text no rule covers is
-- logged in meta.data_issue (entity_kind 'venue_surface') and gets no value; it is never guessed. core.brand_venue_info.surface holds the value
-- now (or the only one), surface_raw the text as published.
-- Periods: core.brand_venue_period holds a surface or a roof for the years a source dates it (Rogers Centre: AstroTurf 1989-2004, FieldTurf
-- 2005-2010 ...). from_year and until_year are inclusive calendar years, null = unknown start / still so. Periods of one kind may touch or share a
-- year (a surface changed in mid-season), so there is no exclusion constraint. sport is null for the whole venue, else a league code (a surface that
-- only one league's games used); source_key says where the row came from (a Wikidata id, or enwiki:<title>@<revision> for English Wikipedia, CC BY-SA 4.0).
-- A venue with no dated surface has no period rows: its surface is the one in core.brand_venue_info.
-- Open or closed: core.brand_venue_info.status is 'closed' (closed_year known), 'demolished' (a source says it is gone, no year) or 'open' (neither
-- Wikidata nor the Wikipedia infobox records a closing or a demolition: the building is still there or the sources do not know otherwise).

create table if not exists ref.venue_surface (
  surface  text primary key,
  name     text not null
);
comment on table ref.venue_surface is 'The fixed list of playing surfaces of a venue (core.brand_venue_info.surface, core.brand_venue_period.value for kind surface).';
insert into ref.venue_surface (surface, name) values
  ('grass', 'Natural grass'), ('artificial', 'Artificial turf'), ('hybrid', 'Hybrid grass'), ('ice', 'Ice'), ('wood', 'Wood floor'),
  ('multi', 'More than one (convertible)'), ('other', 'Other (concrete, clay, dirt)')
on conflict (surface) do nothing;

create table if not exists ref.venue_surface_rule (
  rank     smallint primary key,
  pattern  text not null,                         -- case-insensitive regular expression
  surface  text not null references ref.venue_surface,
  note     text
);
comment on table ref.venue_surface_rule is 'Maps the text a source gives for a surface to ref.venue_surface: the lowest rank whose pattern matches wins. Filled from db/seed/venue_surface_rule.csv.';

alter table core.brand_venue_info add column if not exists surface_raw text;
alter table core.brand_venue_info add column if not exists status text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'brand_venue_info_status_check') then
    alter table core.brand_venue_info add constraint brand_venue_info_status_check check (status in ('open', 'closed', 'demolished'));
  end if;
end $$;
comment on column core.brand_venue_info.surface is 'The surface now (or the only one given), one of ref.venue_surface; the text as published is surface_raw.';
comment on column core.brand_venue_info.status is 'open: no closing or demolition recorded; closed: closed_year is known; demolished: a source says it is gone, with no year.';

create table if not exists core.brand_venue_period (
  wikidata_id   text not null,
  kind          text not null check (kind in ('surface', 'roof')),
  seq           smallint not null,
  value         text not null,                    -- surface: ref.venue_surface; roof: open, dome or retractable
  raw           text,                             -- the text as published
  from_year     smallint,
  until_year    smallint,
  sport         text,                             -- league code when only that league's games used it
  source_id     smallint not null references meta.source,
  source_key    text not null,                    -- the Wikidata item id, or enwiki:<article title>@<revision id>
  primary key (wikidata_id, kind, seq),
  check (from_year is null or until_year is null or from_year <= until_year)
);
comment on table core.brand_venue_period is 'The surface or roof of a home venue for the years a source dates it. A venue with no dated value has no row here (see core.brand_venue_info).';

create or replace view api.venue_period as
select p.wikidata_id, p.kind, p.seq, p.value, p.raw, p.from_year, p.until_year, p.sport, s.code as source, p.source_key
from core.brand_venue_period p join meta.source s using (source_id);
comment on view api.venue_period is 'Surface or roof of a home venue by period (inclusive years; null = unknown start / still so). source wikidata is CC0; source_key enwiki:<title>@<revision> is English Wikipedia, CC BY-SA 4.0.';
grant select on api.venue_period to anon, authenticated;

create or replace view api.venue_info as
select wikidata_id, capacity, opened_year, closed_year, owner, surface, roof, address, postal_code, surface_raw, status from core.brand_venue_info;
comment on view api.venue_info is 'Capacity, year opened and closed, owner, surface (ref.venue_surface, surface_raw as published), roof, address, postal code and open/closed status of a home venue (Wikidata, CC0; some fields English Wikipedia, CC BY-SA 4.0).';
grant select on api.venue_info to anon, authenticated;

-- legacy side (DS1 and the working copy only; production has no legacy_* schemas)
do $$
begin
  if to_regclass('legacy_wikidata_venues.venue') is not null then
    alter table legacy_wikidata_venues.venue add column if not exists destroyed boolean;        -- P31 'destroyed building or structure'
    alter table legacy_wikidata_venues.venue add column if not exists wp_closed_year smallint;   -- infobox |closed=, only when it is one clean year (not a renovation)
    alter table legacy_wikidata_venues.venue add column if not exists wp_closed_raw text;
    alter table legacy_wikidata_venues.venue add column if not exists wp_demolished_year smallint;
    alter table legacy_wikidata_venues.venue add column if not exists wp_demolished_raw text;
    alter table legacy_wikidata_venues.venue add column if not exists wp_status text;            -- infobox |status=
    alter table legacy_wikidata_venues.venue add column if not exists wp_roof_lead text;         -- roof the first paragraph of the article names, when the infobox has none
    alter table legacy_wikidata_venues.venue add column if not exists wp_surface_raw text;       -- the whole infobox |surface= text
    create table if not exists legacy_wikidata_venues.fact (
      qid         text not null references legacy_wikidata_venues.venue,
      kind        text not null check (kind in ('surface', 'roof')),
      ord         smallint not null,
      source      text not null check (source in ('wikidata', 'wikipedia')),
      raw         text not null,
      from_year   smallint,
      until_year  smallint,
      dated       boolean not null,
      primary key (qid, kind, source, ord)
    );
    comment on table legacy_wikidata_venues.fact is 'Surface and roof statements of a venue with the years they carry: Wikidata P765 with P580/P582, and the lines of the Wikipedia infobox surface/roof field.';
  end if;
end $$;
