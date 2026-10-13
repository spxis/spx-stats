-- Seasons whose championship was not awarded (a final abandoned, a series cancelled by a strike, a season lost to a lockout or a
-- pandemic): the title's name and the reason, in English with French and Japanese when known, with its source. It is keyed by league
-- and start year with no link to core.season, because the season may not exist at all (a league year that was not played).
-- The site shows "Stanley Cup: Not awarded" and the reason where the champion would be, and the defending champion goes on being
-- the last one crowned. Seed: db/seed/title_not_awarded.csv, filled by db/build/196_title_not_awarded.sql. Rerunnable.

create table if not exists core.title_not_awarded (
  league_code text not null references ref.league,
  start_year  smallint not null,
  award       text not null,
  reason_en   text not null,
  reason_fr   text,
  reason_ja   text,
  source_id   smallint not null references meta.source,
  source_url  text,
  primary key (league_code, start_year)
);
comment on table core.title_not_awarded is 'A season whose championship was not awarded, and why. Seed: db/seed/title_not_awarded.csv.';
comment on column core.title_not_awarded.award is 'The title as the league names it that year (Stanley Cup, World Series, Grey Cup). A proper name: not translated.';

create or replace view api.title_not_awarded as
select t.league_code as league,
       t.start_year as year,
       t.award,
       t.reason_en,
       t.reason_fr,
       t.reason_ja,
       src.code as source,
       t.source_url
from core.title_not_awarded t
join meta.source src on src.source_id = t.source_id;

grant select on api.title_not_awarded to anon, authenticated;
