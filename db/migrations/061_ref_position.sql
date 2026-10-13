-- Positions as a fixed list per league, and merged people.
--  * ref.position: the positions of each league (code, order, group, name in English, French and Japanese). ref.position_code holds
--    each distinct code once, so core.person can point at it. ref.position_alias maps the raw values the sources state to the codes
--    (source, league, raw value in lower case, order, code). Filled by db/build/185_ref_position.sql.
--  * core.person.primary_position must be a code (foreign key; created NOT VALID so rows still holding the old free text keep
--    working until the data release replaces them, then `alter table core.person validate constraint person_primary_position_fk`).
--    core.person.positions (049) holds codes too; an array cannot be a foreign key, so a trigger checks every element on write.
--  * api.position serves the list to the site.
--  * core.person_redirect: a person merged into another (db/build/185_person_merge.sql) keeps its old id here, so old player links
--    still reach the right page. api.person_redirect serves it. Rerunnable.
begin;

create table if not exists ref.position_code (
  code text primary key check (code ~ '^[A-Z0-9][A-Z0-9-]{0,4}$')
);
comment on table ref.position_code is 'Every position code once. core.person.primary_position and core.person.positions hold these.';

create table if not exists ref.position (
  league_code text not null references ref.league,
  code        text not null references ref.position_code,
  sort        smallint not null,
  grp         text not null,
  name_en     text not null,
  name_fr     text not null,
  name_ja     text not null,
  primary key (league_code, code)
);
comment on table ref.position is 'The fixed list of positions of each league, in the order to show them. Seed: db/build/185_ref_position.sql.';

create table if not exists ref.position_alias (
  source_code text not null,
  league_code text not null,
  raw_value   text not null check (raw_value = lower(btrim(raw_value))),
  ord         smallint not null default 1,
  code        text not null,
  primary key (source_code, league_code, raw_value, ord),
  foreign key (league_code, code) references ref.position (league_code, code) on delete cascade
);
comment on table ref.position_alias is 'What a source''s raw position value means: source (spx, wikidata, nhl_api, wikipedia), league, the value in lower case, and the code(s) it stands for in order. A value with no row here is unmapped and is logged in meta.data_issue, never guessed.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'person_primary_position_fk') then
    alter table core.person add constraint person_primary_position_fk foreign key (primary_position) references ref.position_code (code) not valid;
  end if;
end $$;

create or replace function core.check_person_positions() returns trigger language plpgsql as $$
declare bad text;
begin
  select c into bad from unnest(new.positions) c where not exists (select 1 from ref.position_code k where k.code = c) limit 1;
  if bad is not null then
    raise exception 'core.person.positions: % is not a position code (ref.position_code)', bad using errcode = '23503';
  end if;
  return new;
end $$;
drop trigger if exists person_positions_check on core.person;
create trigger person_positions_check before insert or update of positions on core.person
  for each row when (new.positions is not null) execute function core.check_person_positions();

comment on column core.person.primary_position is 'The main position as a code (ref.position_code), e.g. LW, SS, QB. Built by db/build/186_person_positions.sql.';
comment on column core.person.positions is 'Every position the person holds, as codes, the main one (primary_position) first. Built by db/build/186_person_positions.sql.';

create or replace view api.position as
select league_code as league, code, sort, grp as "group", name_en, name_fr, name_ja
from ref.position
order by league_code, sort;
comment on view api.position is 'The positions of each league: code, order, group and name in English, French and Japanese.';
grant select on api.position to anon, authenticated;

create table if not exists core.person_redirect (
  old_person_id bigint primary key,
  person_id     bigint not null references core.person on delete cascade,
  old_name      text,
  merged_on     date not null default current_date,
  reason        text
);
comment on table core.person_redirect is 'A person record merged into another: the old person_id and the person_id that holds its data now. Old links redirect.';
create index if not exists person_redirect_person_idx on core.person_redirect (person_id);

create or replace view api.person_redirect as
select old_person_id, person_id from core.person_redirect;
comment on view api.person_redirect is 'old_person_id -> person_id for merged people, so an old player link can reach the person.';
grant select on api.person_redirect to anon, authenticated;

commit;
