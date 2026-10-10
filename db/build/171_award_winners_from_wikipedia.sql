-- Award winners from Wikipedia's award articles (CC BY-SA 4.0), read into
-- legacy_wikipedia_awards by scripts/wikipedia_awards/. Runs after 170.
--  * A winner another source already names for the same award and season is not
--    added again: a check mark in meta.verification (entity 'season', field the
--    award's code, plus ':' and the winner where an award has several a season).
--  * A season where Wikipedia and the other sources name different winners keeps
--    both and logs a data_issue (and a 'disputed' verification).
--  * A season core.season does not have is not created: a data_issue says what was left out.
--  * Future seasons are left out. Wikipedia has gaps and cancelled seasons: nothing is invented.
--  * team_season_id: the champion, or the person's team, when the printed team name matches
--    one franchise identity of that league and season (full name, then city, then nickname).
-- Safe to run again; it rebuilds its own rows only.
begin;

insert into meta.source (code, name, kind, licence, attribution, url, notes)
values ('wikipedia', 'Wikipedia', 'website', 'CC BY-SA 4.0', 'Award lists from Wikipedia (en.wikipedia.org), CC BY-SA 4.0.', 'https://en.wikipedia.org',
        'Winner lists of award and championship articles on English Wikipedia.')
on conflict (code) do nothing;

create temp table wp as select source_id from meta.source where code = 'wikipedia';

delete from core.award_winner where source_id = (select source_id from wp);
delete from meta.verification where source_id = (select source_id from wp) and entity_kind = 'season';
delete from meta.data_issue where source_id = (select source_id from wp) and entity_kind = 'award_winner';

create temp table raw_w as
select a.award_id, a.code, a.league_code, a.kind, ar.winners_are_teams, w.season_start, w.row_number,
       w.winner_name, w.team_name, w.position, w.group_label,
       legacy_wikipedia_awards.name_key(w.winner_name) as wkey, legacy_wikipedia_awards.name_key(w.team_name) as tkey
from legacy_wikipedia_awards.winner w
join legacy_wikipedia_awards.article ar using (award_code)
join core.award a on a.code = w.award_code
where w.season_start <= extract(year from current_date);

-- Seasons we do not have.
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wp), 'award_winner', 'wikipedia:' || r.code || ':' || r.season_start,
       format('Wikipedia names %s for %s in the %s season', string_agg(distinct r.winner_name, ', '), r.code, r.season_start),
       'Left out: core.season has no ' || upper(r.league_code) || ' season ' || r.season_start
from raw_w r
where not exists (select 1 from core.season s where s.league_code = r.league_code and s.start_year = r.season_start)
group by r.code, r.league_code, r.season_start;

create temp table w as
select r.*, s.season_id from raw_w r join core.season s on s.league_code = r.league_code and s.start_year = r.season_start;

-- The team a winner played for (or, for a championship, the winner itself): the closest name
-- (full name, then city, then nickname) among the league's teams that season. A name that fits
-- two teams equally (a city with two clubs) is not guessed.
create temp table cand as
select w.row_number, w.code, ts.team_season_id,
       case when legacy_wikipedia_awards.name_key(fi.full_name) = k.k then 1
            when legacy_wikipedia_awards.name_key(fi.location) = k.k then 2
            when legacy_wikipedia_awards.name_key(fi.nickname) = k.k then 3 end as tier
from w
cross join lateral (select case when w.winners_are_teams then w.wkey else w.tkey end as k) k
join core.team_season ts on ts.season_id = w.season_id
join core.franchise_identity fi on fi.franchise_identity_id = ts.franchise_identity_id;
delete from cand where tier is null;

create temp table tk as
select row_number, code, min(team_season_id) as team_season_id
from (select *, min(tier) over (partition by row_number, code) as best from cand) c
where tier = best group by row_number, code having count(distinct team_season_id) = 1;

create temp table wm as
select w.*, tk.team_season_id,
       exists (select 1 from core.award_winner o
               where o.award_id = w.award_id and o.season_id = w.season_id and o.source_id <> (select source_id from wp)
                 and (legacy_wikipedia_awards.name_key(o.winner_name) = w.wkey
                      or (w.kind <> 'person_award' and tk.team_season_id is not null and o.team_season_id = tk.team_season_id))) as agreed,
       exists (select 1 from core.award_winner o
               where o.award_id = w.award_id and o.season_id = w.season_id and o.source_id <> (select source_id from wp)) as others_have_season,
       count(*) over (partition by w.award_id, w.season_id) as n_in_season
from w left join tk using (row_number, code);

-- Agreed with another source: a check mark.
insert into meta.verification (entity_kind, entity_id, field, status, source_id, evidence_url, their_value)
select distinct on (w.season_id, f.field) 'season', w.season_id, f.field, 'confirmed', (select source_id from wp), ar.url, w.winner_name
from wm w join legacy_wikipedia_awards.article ar on ar.award_code = w.code
cross join lateral (select case when w.n_in_season = 1 then w.code else w.code || ':' || w.wkey end as field) f
where w.agreed
order by w.season_id, f.field, w.row_number
on conflict do nothing;

-- A season where no Wikipedia winner is among what the other sources name: keep both and say so.
create temp table disputed as
select w.award_id, w.season_id, w.code from wm w
group by w.award_id, w.season_id, w.code
having bool_or(w.others_have_season) and not bool_or(w.agreed);

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wp), 'award_winner', 'wikipedia:' || d.code || ':' || s.start_year,
       format('%s %s: Wikipedia names %s; %s', d.code, s.start_year,
              (select string_agg(distinct w.winner_name, ', ') from wm w where w.award_id = d.award_id and w.season_id = d.season_id),
              (select string_agg(distinct o.winner_name || ' (' || src.code || ')', ', ')
               from core.award_winner o join meta.source src using (source_id)
               where o.award_id = d.award_id and o.season_id = d.season_id and o.source_id <> (select source_id from wp))),
       'Both kept; needs a third source'
from disputed d join core.season s using (season_id);

insert into meta.verification (entity_kind, entity_id, field, status, source_id, evidence_url, their_value)
select distinct on (w.season_id, f.field) 'season', w.season_id, f.field, 'disputed', (select source_id from wp), ar.url, w.winner_name
from wm w join disputed d on d.award_id = w.award_id and d.season_id = w.season_id
join legacy_wikipedia_awards.article ar on ar.award_code = w.code
cross join lateral (select case when w.n_in_season = 1 then w.code else w.code || ':' || w.wkey end as field) f
order by w.season_id, f.field, w.row_number
on conflict do nothing;

-- The rest are new.
insert into core.award_winner (award_id, season_id, team_season_id, winner_name, note, source_id, source_key)
select w.award_id, w.season_id, (array_agg(w.team_season_id order by w.row_number) filter (where w.team_season_id is not null))[1], w.winner_name,
       nullif(concat_ws('; ',
         case when not w.winners_are_teams and min(w.team_name) is not null then 'Played for ' || min(w.team_name) end,
         string_agg(distinct w.position, '/'),
         string_agg(distinct w.group_label, '/')), ''),
       (select source_id from wp),
       'wikipedia:' || w.code || ':' || w.season_start || ':' || w.wkey
from wm w where not w.agreed
group by w.award_id, w.season_id, w.code, w.season_start, w.wkey, w.winner_name, w.winners_are_teams;

-- A team award whose winner matches none of the teams we hold for that season (a season with no team rows yet is not a naming problem).
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wp), 'award_winner', 'wikipedia:' || w.code || ':' || w.season_start || ':team',
       format('%s %s: Wikipedia names %s, which matches no %s team that season', w.code, w.season_start, w.winner_name, upper(w.league_code)),
       'Winner kept without a team link'
from wm w where w.winners_are_teams and w.team_season_id is null and not w.agreed
  and exists (select 1 from core.team_season ts where ts.season_id = w.season_id);  -- else the season has no teams loaded yet

select a.league_code, count(*) filter (where w.source_id = (select source_id from wp)) as wikipedia_winners,
       count(*) filter (where w.source_id = (select source_id from wp) and w.team_season_id is not null) as linked_to_team
from core.award a join core.award_winner w using (award_id) group by 1 order by 1;
commit;
