-- Standings: as a source published them (core.standing, one row per team per
-- date it was published), and as the final scores add up (core.standing_from_games).
-- When the two disagree for a complete season, the difference is a data issue.

create table core.standing (
  team_season_id   integer not null references core.team_season,
  phase            core.season_phase not null default 'regular',
  as_of            date not null,
  source_id        smallint not null references meta.source,
  games_played     smallint,
  wins             smallint,
  losses           smallint,
  ties             smallint,
  ot_losses        smallint,          -- losses in overtime or a shootout, where the league counts them apart
  points           smallint,
  points_for       integer,           -- goals, runs or points scored
  points_against   integer,
  home_record      text,
  road_record      text,
  last_ten         text,
  streak           text,
  division_rank    smallint,
  games_behind     numeric(4,1),
  source_key       text,
  primary key (team_season_id, phase, as_of, source_id)
);
comment on table core.standing is 'A team''s standing as a source published it on as_of.';

create view core.standing_from_games as
with side as (
  select g.season_id, g.phase, g.home_team_season_id as team_season_id, g.home_score as pf, g.away_score as pa,
         g.went_to_overtime, g.decided_by_shootout, true as at_home
  from core.game g where g.status = 'final'
  union all
  select g.season_id, g.phase, g.away_team_season_id, g.away_score, g.home_score,
         g.went_to_overtime, g.decided_by_shootout, false
  from core.game g where g.status = 'final'
)
select s.team_season_id, s.phase, se.league_code, se.start_year,
       count(*) as games_played,
       count(*) filter (where pf > pa) as wins,
       count(*) filter (where pf < pa and not (se.league_code = 'nhl' and se.start_year >= 1999
                                              and coalesce(went_to_overtime or decided_by_shootout, false))) as losses,
       count(*) filter (where pf = pa) as ties,
       count(*) filter (where pf < pa and se.league_code = 'nhl' and se.start_year >= 1999
                              and coalesce(went_to_overtime or decided_by_shootout, false)) as ot_losses,
       case when se.league_code = 'nhl' then
         2 * count(*) filter (where pf > pa) + count(*) filter (where pf = pa)
         + count(*) filter (where pf < pa and se.start_year >= 1999 and coalesce(went_to_overtime or decided_by_shootout, false))
       end as points,
       sum(pf) as points_for, sum(pa) as points_against,
       count(*) filter (where at_home and pf > pa) || '-' || count(*) filter (where at_home and pf < pa) as home_record,
       count(*) filter (where not at_home and pf > pa) || '-' || count(*) filter (where not at_home and pf < pa) as road_record
from side s join core.season se using (season_id)
group by s.team_season_id, s.phase, se.league_code, se.start_year;
comment on view core.standing_from_games is 'Each team''s record as its final scores add up. NHL overtime and shootout losses count apart from 1999-2000 on.';
