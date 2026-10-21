-- SPX's NBA identities cover only the days SPX has games, and step 147 fills the days either side as separate identities, so each club's
-- unbroken run under one name was three rows (the Heat began on 2012-04-27). This joins every touching run of NBA identities that agree
-- on name, city, nickname, country, abbreviation and region into the row with the lowest franchise_identity_id (SPX's), repoints the
-- team seasons, drops the others and joins the touching NBA memberships the same way. Also repairs a database built before it, in place.
-- Rerunnable; runs after 147_nba_from_wikipedia.sql (and before 179, which sets the abbreviations).
create temp table nba_fr as select distinct franchise_id from core.franchise_league where league_code = 'nba';

create temp table ident_run as
select franchise_identity_id, franchise_id, valid_during,
       sum(new_run::int) over (partition by franchise_id order by lower(valid_during), franchise_identity_id) as run
from (
  select i.franchise_identity_id, i.franchise_id, i.valid_during,
         coalesce(lag(upper(i.valid_during)) over w is distinct from lower(i.valid_during)
                  or (lag(i.full_name, 1) over w, lag(i.location, 1) over w, lag(i.nickname, 1) over w, lag(i.country_code, 1) over w,
                      lag(i.abbreviation, 1) over w, lag(i.region, 1) over w)
                     is distinct from (i.full_name, i.location, i.nickname, i.country_code, i.abbreviation, i.region), true) as new_run
  from core.franchise_identity i
  where i.franchise_id in (select franchise_id from nba_fr)
  window w as (partition by i.franchise_id order by lower(i.valid_during), i.franchise_identity_id)
) x;

create temp table ident_merge as
select r.franchise_id, r.run, min(r.franchise_identity_id) as keep_id,
       range_agg(r.valid_during) as merged
from ident_run r
group by r.franchise_id, r.run
having count(*) > 1;

update core.team_season ts set franchise_identity_id = m.keep_id
from ident_run r join ident_merge m using (franchise_id, run)
where ts.franchise_identity_id = r.franchise_identity_id and r.franchise_identity_id <> m.keep_id;

delete from core.franchise_identity i
using ident_run r join ident_merge m using (franchise_id, run)
where i.franchise_identity_id = r.franchise_identity_id and r.franchise_identity_id <> m.keep_id;

update core.franchise_identity i set valid_during = daterange(lower(m.merged), upper(m.merged))
from ident_merge m
where i.franchise_identity_id = m.keep_id;

create temp table lg_run as
select franchise_id, valid_during, source_id,
       sum(new_run::int) over (partition by franchise_id order by lower(valid_during)) as run
from (
  select l.franchise_id, l.valid_during, l.source_id,
         coalesce(lag(upper(l.valid_during)) over w is distinct from lower(l.valid_during), true) as new_run
  from core.franchise_league l
  where l.league_code = 'nba'
  window w as (partition by l.franchise_id order by lower(l.valid_during))
) x;

create temp table lg_merge as
select franchise_id, run, range_agg(valid_during) as merged,
       (array_agg(source_id order by lower(valid_during)))[1] as source_id
from lg_run group by franchise_id, run having count(*) > 1;

delete from core.franchise_league l
using lg_run r join lg_merge m using (franchise_id, run)
where l.league_code = 'nba' and l.franchise_id = r.franchise_id and l.valid_during = r.valid_during;

insert into core.franchise_league (franchise_id, league_code, valid_during, source_id)
select franchise_id, 'nba', daterange(lower(merged), upper(merged)), source_id from lg_merge;

select 'nba identities merged away' as what, (select count(*) from ident_run) - (select count(*) from core.franchise_identity where franchise_id in (select franchise_id from nba_fr)) as n
union all select 'nba identities', count(*) from core.franchise_identity where franchise_id in (select franchise_id from nba_fr)
union all select 'nba memberships', count(*) from core.franchise_league where league_code = 'nba';
