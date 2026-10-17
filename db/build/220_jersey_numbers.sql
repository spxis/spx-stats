-- Jersey numbers and retired numbers from English Wikipedia lists (CC BY-SA) and
-- Wikidata P1618 (CC0), plus numbers already on core.roster_stint.
-- Deletes only the rows this step wrote (source_key prefixes below). Safe to rerun.
-- A name that fits two people or two clubs is left unmatched and logged; nothing is guessed.

insert into meta.source (code, name, kind, licence, attribution, url, notes)
values ('wikipedia', 'Wikipedia', 'website', 'CC BY-SA 4.0',
        'English Wikipedia, CC BY-SA 4.0.', 'https://en.wikipedia.org',
        'Retired-number lists.')
on conflict (code) do nothing;

insert into meta.source (code, name, kind, licence, attribution, url, notes)
values ('wikidata', 'Wikidata', 'dataset', 'CC0 1.0',
        'Wikidata contributors, CC0.', 'https://www.wikidata.org/',
        'Sport numbers (P1618).')
on conflict (code) do nothing;

create temp table wp as select source_id from meta.source where code = 'wikipedia';
create temp table wd as select source_id from meta.source where code = 'wikidata';

delete from core.retired_number
 where source_id = (select source_id from wp) and source_key like 'jersey-retired:%';
delete from core.person_jersey
 where source_id = (select source_id from wp) and source_key like 'jersey-retired:%';
delete from core.person_jersey
 where source_id = (select source_id from wd) and source_key like 'jersey-p1618:%';
delete from core.person_jersey
 where source_key like 'jersey-roster:%';
delete from meta.data_issue
 where entity_kind in ('retired_number', 'person_jersey')
   and entity_key like 'jersey-%';

create temp table names as
select fl.league_code, i.franchise_id,
       legacy_wikipedia_jersey.name_key(i.full_name) as k, 1 as tier
from core.franchise_identity i
join core.franchise_league fl on fl.franchise_id = i.franchise_id
union
select fl.league_code, i.franchise_id,
       legacy_wikipedia_jersey.name_key(i.location || i.nickname), 2
from core.franchise_identity i
join core.franchise_league fl on fl.franchise_id = i.franchise_id
union
select fl.league_code, i.franchise_id,
       legacy_wikipedia_jersey.name_key(i.location), 3
from core.franchise_identity i
join core.franchise_league fl on fl.franchise_id = i.franchise_id
where length(legacy_wikipedia_jersey.name_key(i.location)) >= 4;

-- A key that names two clubs in the same league at the same tier is not used.
create temp table team_key as
select league_code, k, min(franchise_id) as franchise_id
from (
  select *, min(tier) over (partition by league_code, k) as best
  from names
  where k <> ''
) x
where tier = best
group by league_code, k
having count(distinct franchise_id) = 1;

create temp table raw as
select r.*, a.revision_id, a.title as article_title,
       tk.franchise_id
from legacy_wikipedia_jersey.retired r
join legacy_wikipedia_jersey.article a using (article_code)
left join team_key tk on tk.league_code = r.league_code and tk.k = r.team_key
where r.jersey_number between 0 and 99;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wp), 'retired_number',
       'jersey-team:' || r.article_code || ':' || r.row_number,
       format('Wikipedia names retired number %s for %s (%s) with no matching franchise',
              r.jersey_number, coalesce(r.team_name, '?'), r.league_code),
       'Left unmatched: team name did not fit one franchise of that league'
from raw r
where r.franchise_id is null and not r.league_wide and r.team_key is not null;

-- People: Wikidata QID first, then a unique name in that franchise, then a unique name in the league.
create temp table qid as
select x.entity_id as person_id, x.external_key as qid
from core.external_id x
join meta.source s on s.source_id = x.source_id
where x.entity_kind = 'person' and x.external_key ~ '^Q[0-9]+$'
  and s.code in ('wikidata', 'wikidata_meigen');

create temp table person_names as
select p.person_id, legacy_wikipedia_jersey.name_key(p.full_name) as k
from core.person p
where p.full_name is not null;

create temp table person_on_club as
select distinct ts.franchise_id, s.league_code, rs.person_id
from core.roster_stint rs
join core.team_season ts on ts.team_season_id = rs.team_season_id
join core.season s on s.season_id = ts.season_id;

create temp table person_in_league as
select distinct league_code, person_id from person_on_club;

create temp table club_hit as
select r.article_code, r.row_number, min(pn.person_id) as person_id
from raw r
join person_names pn on pn.k = r.player_key
join person_on_club c on c.person_id = pn.person_id
                     and c.franchise_id = r.franchise_id
                     and c.league_code = r.league_code
where r.player_key is not null and r.franchise_id is not null
group by r.article_code, r.row_number
having count(distinct pn.person_id) = 1;

create temp table league_hit as
select r.article_code, r.row_number, min(pn.person_id) as person_id
from raw r
join person_names pn on pn.k = r.player_key
join person_in_league L on L.person_id = pn.person_id and L.league_code = r.league_code
where r.player_key is not null
  and not exists (select 1 from club_hit h where h.article_code = r.article_code and h.row_number = r.row_number)
group by r.article_code, r.row_number
having count(distinct pn.person_id) = 1;

-- Wikipedia article title we already hold (never a bare display name).
create temp table wiki_title as
select x.entity_id as person_id,
       x.external_key as title,
       legacy_wikipedia_jersey.name_key(replace(x.external_key, '_', ' ')) as k
from core.external_id x
join meta.source s on s.source_id = x.source_id
where x.entity_kind = 'person'
  and s.code = 'wikipedia'
  and x.external_key !~ '^Q[0-9]+$';

create temp table title_hit as
select r.article_code, r.row_number, min(w.person_id) as person_id
from raw r
join wiki_title w
  on w.title = r.player_title
  or w.k = legacy_wikipedia_jersey.name_key(r.player_title)
where r.player_title is not null and r.player_title <> ''
group by r.article_code, r.row_number
having count(distinct w.person_id) = 1;

create temp table chosen as
select r.*,
       coalesce(th.person_id, ch.person_id, lh.person_id) as person_id
from raw r
left join title_hit th using (article_code, row_number)
left join club_hit ch using (article_code, row_number)
left join league_hit lh using (article_code, row_number);

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wp), 'retired_number',
       'jersey-person:' || c.article_code || ':' || c.row_number,
       format('Wikipedia names %s for retired number %s (%s) with no unique person',
              coalesce(c.player_name, '?'), c.jersey_number, c.league_code),
       'Banner kept under the printed name; person_id left empty'
from chosen c
where c.person_id is null and c.player_name is not null;

insert into core.retired_number
  (league_code, franchise_id, jersey_number, person_id, honor_name,
   retired_on, tenure_text, source_id, source_key)
select c.league_code,
       case when c.league_wide then null else c.franchise_id end,
       c.jersey_number,
       c.person_id,
       case when c.person_id is null then c.player_name end,
       c.retired_on,
       c.tenure_text,
       (select source_id from wp),
       'jersey-retired:' || c.article_code || ':' || c.row_number
        || ':r' || coalesce(c.revision_id::text, '0')
from chosen c
where c.person_id is not null or c.player_name is not null;

-- A retired number is also a number that person wore.
insert into core.person_jersey
  (person_id, franchise_id, league_code, jersey_number, from_year, to_year, source_id, source_key)
select c.person_id,
       case when c.league_wide then null else c.franchise_id end,
       c.league_code,
       c.jersey_number,
       null, null,
       (select source_id from wp),
       'jersey-retired:' || c.article_code || ':' || c.row_number || ':wore'
from chosen c
where c.person_id is not null;

-- Wikidata P1618, QID-matched people only.
create temp table wd_team as
select x.entity_id as franchise_id, x.external_key as qid
from core.external_id x
join meta.source s on s.source_id = x.source_id
where x.entity_kind = 'franchise' and x.external_key ~ '^Q[0-9]+$'
  and s.code = 'wikidata';

insert into core.person_jersey
  (person_id, franchise_id, league_code, jersey_number, from_year, to_year, source_id, source_key)
select q.person_id,
       wt.franchise_id,
       lg.league_code,
       n.jersey_number,
       n.from_year, n.to_year,
       (select source_id from wd),
       'jersey-p1618:' || n.qid || ':' || n.statement
from legacy_wikidata_jersey.sport_number n
join qid q on q.qid = n.qid
left join wd_team wt on wt.qid = n.team_qid
cross join lateral (
  select coalesce(
    (select fl.league_code from core.franchise_league fl
      where wt.franchise_id is not null and fl.franchise_id = wt.franchise_id
      order by upper(fl.valid_during) desc nulls last limit 1),
    (select c.league_code from person_on_club c
      where c.person_id = q.person_id
      order by c.league_code limit 1)
  ) as league_code
) lg
where lg.league_code is not null
on conflict (source_id, source_key) do nothing;

-- Numbers already on roster stints (nflverse and others). Own prefix only.
insert into core.person_jersey
  (person_id, franchise_id, league_code, jersey_number, from_year, to_year, source_id, source_key)
select rs.person_id, ts.franchise_id, s.league_code, rs.jersey_number,
       min(s.start_year), max(s.start_year),
       min(rs.source_id),
       'jersey-roster:' || rs.person_id::text || ':' || ts.franchise_id::text || ':' || rs.jersey_number::text
from core.roster_stint rs
join core.team_season ts on ts.team_season_id = rs.team_season_id
join core.season s on s.season_id = ts.season_id
where rs.role = 'player' and rs.jersey_number between 0 and 99
group by rs.person_id, ts.franchise_id, s.league_code, rs.jersey_number
on conflict (source_id, source_key) do nothing;

select 'retired' as kind, count(*) from core.retired_number
union all
select 'person_jersey', count(*) from core.person_jersey
union all
select 'retired_nhl', count(*) from core.retired_number where league_code = 'nhl'
union all
select 'issues', count(*) from meta.data_issue
 where entity_kind in ('retired_number', 'person_jersey') and entity_key like 'jersey-%';
