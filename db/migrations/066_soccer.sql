-- Soccer: the FIFA World Cup, men's (1930-) and women's (1991-). Add-only: new tables and views, and one widened check.
-- Design (docs/soccer.md): a tournament is not a season of a franchise league, so it does not go into core.season / core.game /
-- core.team_season (that would put national teams into every team, standings and player list of the five leagues). It has its own
-- core.soccer_* tables. People are core.person rows (kind player / coach / official), matched to an existing person only with a confirming
-- fact. National teams are core.soccer_team. A match's stadium is kept as the source's name, city and country plus a Wikidata id; no
-- venue is created here (venue_id is filled later by the world stadium dataset, by Wikidata id, only where it is null).
-- Everything is rebuilt by db/build/200_worldcup.sql from legacy_worldcup (065, DS1 only) and published by a data release.
-- Sources: jfjelstul/worldcup (Joshua C. Fjelstul, CC BY-SA 4.0; the men's and women's tournaments to 2022 and 2019), openfootball/worldcup
-- (CC0; the second check for 1930-2022, and the only source for 2026), Wikidata (CC0; item ids). Rerunnable.
begin;

-- the second source's word on a match goes into meta.verification like every other check
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'meta.verification'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%entity_kind%';
  if c is not null then execute format('alter table meta.verification drop constraint %I', c); end if;
  alter table meta.verification add constraint verification_entity_kind_check check (entity_kind in
    ('franchise', 'franchise_identity', 'team_season', 'season', 'game', 'betting_line', 'person', 'venue', 'player_season_stat', 'soccer_match'));
end $$;

-- ---------------------------------------------------------------- teams and tournaments

create table if not exists core.soccer_team (
  team_id           text primary key,                -- jfjelstul's id (T-30), or X-<slug> for a team the sources add later
  name              text not null,                   -- the name the source uses, English (West Germany, Soviet Union, Ivory Coast)
  slug              text not null unique,
  fifa_code         text,                            -- the source's three-letter code (not unique: West Germany and Germany share DEU)
  flag_code         text,                            -- ISO 3166-1 or 3166-2 code Hata draws (GB-ENG for England); null for a state that no longer exists
  country_code      text references ref.country,     -- ISO 3166-1 alpha-2 of the country; GB for England, Scotland, Wales, Northern Ireland; null if none
  federation        text,
  region            text,                            -- Africa, Asia, Europe, ...
  confederation     text,                            -- CAF, AFC, UEFA, CONMEBOL, CONCACAF, OFC
  continues_team_id text,                            -- the earlier team FIFA treats this one as the continuation of (Germany continues West Germany)
  wikidata_men      text,                            -- Wikidata item of the men's national team, when the source links its article
  wikidata_women    text,
  has_men           boolean not null default false,
  has_women         boolean not null default false,
  source_id         smallint not null references meta.source
);
comment on table core.soccer_team is 'A national football team (one per country or former state; the men''s and the women''s share the row).';

create table if not exists core.soccer_tournament (
  tournament_id      text primary key,               -- wc1930, wwc1991
  league_code        text not null references ref.league,
  year               smallint not null,
  name               text not null,                  -- 1930 FIFA Men's World Cup
  host_names         text[] not null,                -- as the source names them
  host_team_ids      text[] not null default '{}',
  start_date         date,
  end_date           date,
  team_count         smallint,
  winner_team_id     text references core.soccer_team,
  runner_up_team_id  text references core.soccer_team,
  third_team_id      text references core.soccer_team,
  fourth_team_id     text references core.soccer_team,
  source_id          smallint not null references meta.source,
  unique (league_code, year)
);
comment on table core.soccer_tournament is 'One World Cup. league_code wc (men) or wwc (women).';

create table if not exists core.soccer_tournament_team (
  tournament_id   text not null references core.soccer_tournament on delete cascade,
  team_id         text not null references core.soccer_team,
  performance     text,                              -- the furthest stage: group stage, round of 16, quarter-finals, semi-finals, third place, runners-up, champions, ...
  final_position  smallint,                          -- 1 to 4 where the source ranks them
  is_host         boolean not null default false,
  primary key (tournament_id, team_id)
);

create table if not exists core.soccer_group_standing (
  tournament_id  text not null references core.soccer_tournament on delete cascade,
  stage_number   smallint not null,
  stage_key      text not null,                      -- group, second_group, final_round, first_round
  group_name     text not null,                      -- Group A
  position       smallint not null,
  team_id        text not null references core.soccer_team,
  played smallint, wins smallint, draws smallint, losses smallint,
  goals_for smallint, goals_against smallint, goal_difference smallint, points smallint,
  advanced       boolean,
  primary key (tournament_id, stage_number, group_name, team_id)
);

-- ---------------------------------------------------------------- matches and what happened in them

create table if not exists core.soccer_match (
  match_id           bigint generated always as identity primary key,
  source_key         text not null unique,           -- M-1930-01 (jfjelstul), or of-2026-073 (openfootball only)
  tournament_id      text not null references core.soccer_tournament on delete cascade,
  stage_key          text not null,                  -- group, second_group, final_round, round_of_32, round_of_16, quarter, semi, third_place, final
  stage_order        smallint not null,
  group_name         text,
  match_number       smallint,
  match_date         date not null,
  kickoff_local      time,
  utc_offset         text,                           -- 2026 only
  home_team_id       text not null references core.soccer_team,
  away_team_id       text not null references core.soccer_team,
  home_goals         smallint not null check (home_goals >= 0),   -- the score at the end of play, extra time included, shootout not
  away_goals         smallint not null check (away_goals >= 0),
  home_goals_90      smallint,                       -- after 90 minutes, when the goals show it (only for a match with extra time)
  away_goals_90      smallint,
  extra_time         boolean not null default false,
  shootout           boolean not null default false,
  home_penalties     smallint,
  away_penalties     smallint,
  winner_team_id     text references core.soccer_team,           -- null for a draw
  is_replay          boolean not null default false,
  venue_name         text,                           -- the stadium as the source names it, with its city and country
  venue_city         text,
  venue_country      text,
  venue_wikidata_id  text,                           -- from the source's Wikipedia link, or openfootball's own list
  venue_id           integer references core.venue,  -- filled later from the world stadium dataset by venue_wikidata_id; never written by the World Cup build
  source_id          smallint not null references meta.source,
  check (home_team_id <> away_team_id),
  check (shootout = false or (home_penalties is not null and away_penalties is not null))
);
create index if not exists soccer_match_tournament_idx on core.soccer_match (tournament_id, match_date, match_id);
create index if not exists soccer_match_home_idx on core.soccer_match (home_team_id);
create index if not exists soccer_match_away_idx on core.soccer_match (away_team_id);

create table if not exists core.soccer_appearance (
  match_id       bigint not null references core.soccer_match on delete cascade,
  person_id      bigint not null references core.person,
  team_id        text not null references core.soccer_team,
  shirt_number   smallint,
  position_name  text,
  position_code  text,                               -- GK, DF, MF, FW
  starter        boolean not null,
  substitute     boolean not null,                   -- on the bench (whether or not he came on; see core.soccer_substitution)
  primary key (match_id, person_id)
);
create index if not exists soccer_appearance_person_idx on core.soccer_appearance (person_id);

create table if not exists core.soccer_goal (
  goal_id         text primary key,                  -- G-0001, or of-2026-073-1
  match_id        bigint not null references core.soccer_match on delete cascade,
  team_id         text not null references core.soccer_team,     -- the team the goal counted for
  person_id       bigint references core.person,                 -- null for 2026, whose source names scorers but has no ids
  scorer_name     text not null,
  shirt_number    smallint,
  minute_label    text not null,                     -- 19', 90+3'
  minute          smallint,                          -- the minute without stoppage
  stoppage        smallint,                          -- minutes of added time (0 if none)
  period          text,                              -- first half, second half, extra time, first half, ...
  own_goal        boolean not null default false,
  penalty         boolean not null default false
);
create index if not exists soccer_goal_match_idx on core.soccer_goal (match_id);
create index if not exists soccer_goal_person_idx on core.soccer_goal (person_id);

create table if not exists core.soccer_booking (
  booking_id      text primary key,
  match_id        bigint not null references core.soccer_match on delete cascade,
  team_id         text not null references core.soccer_team,
  person_id       bigint not null references core.person,
  shirt_number    smallint,
  minute_label    text not null,
  minute          smallint,
  stoppage        smallint,
  period          text,
  yellow_card     boolean not null,
  red_card        boolean not null,
  second_yellow   boolean not null,
  sending_off     boolean not null
);
create index if not exists soccer_booking_match_idx on core.soccer_booking (match_id);
create index if not exists soccer_booking_person_idx on core.soccer_booking (person_id);

create table if not exists core.soccer_substitution (
  substitution_id text primary key,
  match_id        bigint not null references core.soccer_match on delete cascade,
  team_id         text not null references core.soccer_team,
  person_id       bigint not null references core.person,
  shirt_number    smallint,
  minute_label    text not null,
  minute          smallint,
  stoppage        smallint,
  period          text,
  going_off       boolean not null,                  -- one row per player: the one who left, the one who came on
  coming_on       boolean not null
);
create index if not exists soccer_substitution_match_idx on core.soccer_substitution (match_id);

create table if not exists core.soccer_penalty_kick (
  kick_id     text primary key,                      -- a kick in a penalty shootout
  match_id    bigint not null references core.soccer_match on delete cascade,
  team_id     text not null references core.soccer_team,
  person_id   bigint not null references core.person,
  shirt_number smallint,
  converted   boolean not null
);
create index if not exists soccer_penalty_kick_match_idx on core.soccer_penalty_kick (match_id);

create table if not exists core.soccer_match_manager (
  match_id      bigint not null references core.soccer_match on delete cascade,
  team_id       text not null references core.soccer_team,
  person_id     bigint not null references core.person,
  country_name  text,                                -- the country the source gives for the manager (not always the team's)
  primary key (match_id, team_id, person_id)
);
create table if not exists core.soccer_match_referee (
  match_id      bigint not null references core.soccer_match on delete cascade,
  person_id     bigint not null references core.person,
  country_name  text,                                -- the referee's country as the source names it
  primary key (match_id, person_id)
);

-- ---------------------------------------------------------------- squads, managers, awards

create table if not exists core.soccer_squad (
  tournament_id  text not null references core.soccer_tournament on delete cascade,
  team_id        text not null references core.soccer_team,
  person_id      bigint not null references core.person,
  shirt_number   smallint,
  position_name  text,
  position_code  text,
  primary key (tournament_id, team_id, person_id)
);
create index if not exists soccer_squad_person_idx on core.soccer_squad (person_id);

create table if not exists core.soccer_manager (
  tournament_id  text not null references core.soccer_tournament on delete cascade,
  team_id        text not null references core.soccer_team,
  person_id      bigint not null references core.person,
  primary key (tournament_id, team_id, person_id)
);

create table if not exists core.soccer_award (
  tournament_id  text not null references core.soccer_tournament on delete cascade,
  award          text not null,                      -- Golden Ball, Golden Boot, Golden Glove, Best Young Player, ...
  award_order    smallint not null,
  person_id      bigint not null references core.person,
  team_id        text references core.soccer_team,
  shared         boolean not null default false,
  primary key (tournament_id, award, person_id)
);

-- ---------------------------------------------------------------- the API

-- every match once from each team's side
create or replace view api.soccer_team_matches as
select m.match_id, t.league_code as league, t.year, m.tournament_id, m.stage_key, m.stage_order, m.group_name, m.match_date,
       s.team_id, s.opponent_id, opp.name as opponent, opp.slug as opponent_slug, opp.flag_code as opponent_flag,
       s.is_home, s.gf, s.ga,
       case when s.gf > s.ga then 'w' when s.gf < s.ga then 'l' else 'd' end as result,
       m.extra_time, m.shootout, s.pens_for, s.pens_against,
       (m.winner_team_id = s.team_id) as won_match,
       m.venue_name, m.venue_city, m.venue_country
from core.soccer_match m
join core.soccer_tournament t using (tournament_id)
cross join lateral (values
  (m.home_team_id, m.away_team_id, true,  m.home_goals, m.away_goals, m.home_penalties, m.away_penalties),
  (m.away_team_id, m.home_team_id, false, m.away_goals, m.home_goals, m.away_penalties, m.home_penalties)
) s(team_id, opponent_id, is_home, gf, ga, pens_for, pens_against)
join core.soccer_team opp on opp.team_id = s.opponent_id;

create or replace view api.soccer_teams as
select t.team_id, t.name, t.slug, t.fifa_code, t.flag_code, t.country_code, t.federation, t.region, t.confederation, t.continues_team_id,
       t.has_men, t.has_women, t.wikidata_men, t.wikidata_women,
       (select count(*)::int from core.soccer_tournament_team tt where tt.team_id = t.team_id) as tournaments
from core.soccer_team t;

create or replace view api.soccer_team_records as
select m.team_id, m.league,
       count(distinct m.tournament_id)::int as tournaments,
       count(*)::int as played,
       count(*) filter (where m.result = 'w')::int as won,
       count(*) filter (where m.result = 'd')::int as drawn,
       count(*) filter (where m.result = 'l')::int as lost,
       sum(m.gf)::int as goals_for, sum(m.ga)::int as goals_against
from api.soccer_team_matches m
group by m.team_id, m.league;

create or replace view api.soccer_tournament_teams as
select tt.tournament_id, t.league_code as league, t.year, tt.team_id, tm.name as team, tm.slug as team_slug, tm.flag_code, tt.performance, tt.final_position, tt.is_host,
       g.group_name,
       coalesce(r.played, 0) as played, coalesce(r.won, 0) as won, coalesce(r.drawn, 0) as drawn, coalesce(r.lost, 0) as lost,
       coalesce(r.gf, 0) as goals_for, coalesce(r.ga, 0) as goals_against,
       (select array_agg(p.full_name order by p.full_name) from core.soccer_manager mg join core.person p using (person_id)
         where mg.tournament_id = tt.tournament_id and mg.team_id = tt.team_id) as managers
from core.soccer_tournament_team tt
join core.soccer_tournament t using (tournament_id)
join core.soccer_team tm using (team_id)
left join lateral (select gs.group_name from core.soccer_group_standing gs
                    where gs.tournament_id = tt.tournament_id and gs.team_id = tt.team_id order by gs.stage_number limit 1) g on true
left join lateral (select count(*)::int as played, count(*) filter (where x.result = 'w')::int as won, count(*) filter (where x.result = 'd')::int as drawn,
                          count(*) filter (where x.result = 'l')::int as lost, sum(x.gf)::int as gf, sum(x.ga)::int as ga
                     from api.soccer_team_matches x where x.tournament_id = tt.tournament_id and x.team_id = tt.team_id) r on true;

create or replace view api.soccer_matches as
select m.match_id, m.source_key, t.league_code as league, t.year, m.tournament_id, m.stage_key, m.stage_order, m.group_name, m.match_number, m.match_date,
       m.kickoff_local, m.utc_offset,
       m.home_team_id, h.name as home, h.slug as home_slug, h.flag_code as home_flag, m.home_goals,
       m.away_team_id, a.name as away, a.slug as away_slug, a.flag_code as away_flag, m.away_goals,
       m.home_goals_90, m.away_goals_90, m.extra_time, m.shootout, m.home_penalties, m.away_penalties,
       m.winner_team_id, m.is_replay, m.venue_name, m.venue_city, m.venue_country, m.venue_wikidata_id, m.venue_id,
       (select count(*)::int from core.soccer_appearance x where x.match_id = m.match_id) as lineup_players,
       (select count(*)::int from core.soccer_goal x where x.match_id = m.match_id) as goal_rows,
       (select code from meta.source where source_id = m.source_id) as source,
       (select max(case v.status when 'confirmed' then 1 when 'disputed' then -1 end) from meta.verification v
         where v.entity_kind = 'soccer_match' and v.entity_id = m.match_id) as checked
from core.soccer_match m
join core.soccer_tournament t using (tournament_id)
join core.soccer_team h on h.team_id = m.home_team_id
join core.soccer_team a on a.team_id = m.away_team_id;

create or replace view api.soccer_scorers as
select g.match_id, m.tournament_id, t.league_code as league, t.year, g.team_id, tm.name as team, tm.slug as team_slug, tm.flag_code,
       g.person_id, g.scorer_name, g.minute_label, g.minute, g.stoppage, g.period, g.own_goal, g.penalty
from core.soccer_goal g
join core.soccer_match m using (match_id)
join core.soccer_tournament t using (tournament_id)
join core.soccer_team tm on tm.team_id = g.team_id;

-- goals per player in a tournament (own goals not counted for the scorer)
create or replace view api.soccer_top_scorers as
select m.tournament_id, t.league_code as league, t.year, g.person_id, g.scorer_name as player, g.team_id, tm.name as team, tm.slug as team_slug, tm.flag_code,
       count(*) filter (where not g.own_goal)::int as goals,
       count(*) filter (where g.penalty and not g.own_goal)::int as penalties,
       count(distinct g.match_id)::int as matches_scored_in
from core.soccer_goal g
join core.soccer_match m using (match_id)
join core.soccer_tournament t using (tournament_id)
join core.soccer_team tm on tm.team_id = g.team_id
where not g.own_goal
group by m.tournament_id, t.league_code, t.year, g.person_id, g.scorer_name, g.team_id, tm.name, tm.slug, tm.flag_code;

create or replace view api.soccer_tournaments as
select t.tournament_id, t.league_code as league, t.year, t.name, t.host_names, t.host_team_ids, t.start_date, t.end_date, t.team_count,
       t.winner_team_id, w.name as winner, w.slug as winner_slug, w.flag_code as winner_flag,
       t.runner_up_team_id, r.name as runner_up, r.slug as runner_up_slug, r.flag_code as runner_up_flag,
       t.third_team_id, t3.name as third, t.fourth_team_id, t4.name as fourth,
       f.match_id as final_match_id, f.home as final_home, f.away as final_away, f.home_goals as final_home_goals, f.away_goals as final_away_goals,
       f.extra_time as final_extra_time, f.shootout as final_shootout, f.home_penalties as final_home_penalties, f.away_penalties as final_away_penalties,
       (select count(*)::int from core.soccer_match m where m.tournament_id = t.tournament_id) as matches,
       (select coalesce(sum(m.home_goals + m.away_goals), 0)::int from core.soccer_match m where m.tournament_id = t.tournament_id) as goals,
       ts.top_goals, ts.top_scorers, ts.top_person_ids,
       (select code from meta.source where source_id = t.source_id) as source
from core.soccer_tournament t
left join core.soccer_team w on w.team_id = t.winner_team_id
left join core.soccer_team r on r.team_id = t.runner_up_team_id
left join core.soccer_team t3 on t3.team_id = t.third_team_id
left join core.soccer_team t4 on t4.team_id = t.fourth_team_id
left join lateral (select x.* from api.soccer_matches x where x.tournament_id = t.tournament_id and x.stage_key = 'final' order by x.match_date desc, x.match_id desc limit 1) f on true
left join lateral (
  select max(s.goals) as top_goals, array_agg(s.player order by s.player) as top_scorers, array_agg(s.person_id order by s.player) as top_person_ids
  from api.soccer_top_scorers s
  where s.tournament_id = t.tournament_id and s.goals = (select max(s2.goals) from api.soccer_top_scorers s2 where s2.tournament_id = t.tournament_id)
) ts on true;

create or replace view api.soccer_standings as
select gs.tournament_id, t.league_code as league, t.year, gs.stage_number, gs.stage_key, gs.group_name, gs.position, gs.team_id,
       tm.name as team, tm.slug as team_slug, tm.flag_code,
       gs.played, gs.wins, gs.draws, gs.losses, gs.goals_for, gs.goals_against, gs.goal_difference, gs.points, gs.advanced
from core.soccer_group_standing gs
join core.soccer_tournament t using (tournament_id)
join core.soccer_team tm using (team_id);

create or replace view api.soccer_lineups as
select a.match_id, a.team_id, tm.name as team, a.person_id, p.full_name as player, a.shirt_number, a.position_name, a.position_code, a.starter, a.substitute,
       (select s.minute_label from core.soccer_substitution s where s.match_id = a.match_id and s.person_id = a.person_id and s.going_off limit 1) as off_at,
       (select s.minute_label from core.soccer_substitution s where s.match_id = a.match_id and s.person_id = a.person_id and s.coming_on limit 1) as on_at
from core.soccer_appearance a
join core.person p using (person_id)
join core.soccer_team tm on tm.team_id = a.team_id;

create or replace view api.soccer_cards as
select b.booking_id, b.match_id, b.team_id, tm.name as team, b.person_id, p.full_name as player, b.shirt_number, b.minute_label, b.minute, b.stoppage, b.period,
       b.yellow_card, b.red_card, b.second_yellow, b.sending_off
from core.soccer_booking b
join core.person p using (person_id)
join core.soccer_team tm on tm.team_id = b.team_id;

create or replace view api.soccer_substitutions as
select s.substitution_id, s.match_id, s.team_id, tm.name as team, s.person_id, p.full_name as player, s.shirt_number, s.minute_label, s.minute, s.stoppage, s.period,
       s.going_off, s.coming_on
from core.soccer_substitution s
join core.person p using (person_id)
join core.soccer_team tm on tm.team_id = s.team_id;

create or replace view api.soccer_shootout as
select k.kick_id, k.match_id, k.team_id, tm.name as team, k.person_id, p.full_name as player, k.shirt_number, k.converted
from core.soccer_penalty_kick k
join core.person p using (person_id)
join core.soccer_team tm on tm.team_id = k.team_id;

create or replace view api.soccer_match_staff as
select mm.match_id, 'manager'::text as role, mm.team_id, tm.name as team, mm.person_id, p.full_name as name, mm.country_name as country,
       (select c.flag_code from core.soccer_team c where c.name = mm.country_name limit 1) as flag_code
from core.soccer_match_manager mm
join core.person p using (person_id)
join core.soccer_team tm on tm.team_id = mm.team_id
union all
select r.match_id, 'referee', null, null, r.person_id, p.full_name, r.country_name,
       (select c.flag_code from core.soccer_team c where c.name = r.country_name limit 1)
from core.soccer_match_referee r
join core.person p using (person_id);

create or replace view api.soccer_squads as
select q.tournament_id, t.league_code as league, t.year, q.team_id, tm.name as team, tm.slug as team_slug,
       q.person_id, p.full_name as player, p.birth_date, q.shirt_number, q.position_name, q.position_code,
       coalesce(ap.played, 0) as played, coalesce(ap.started, 0) as started, coalesce(gl.goals, 0) as goals,
       coalesce(bk.yellow, 0) as yellow, coalesce(bk.red, 0) as red
from core.soccer_squad q
join core.soccer_tournament t using (tournament_id)
join core.soccer_team tm using (team_id)
join core.person p using (person_id)
left join lateral (select count(*) filter (where a.starter or exists
                            (select 1 from core.soccer_substitution s where s.match_id = a.match_id and s.person_id = a.person_id and s.coming_on))::int as played,
                          count(*) filter (where a.starter)::int as started
                     from core.soccer_appearance a join core.soccer_match m using (match_id)
                    where m.tournament_id = q.tournament_id and a.person_id = q.person_id and a.team_id = q.team_id) ap on true
left join lateral (select count(*) filter (where not g.own_goal)::int as goals
                     from core.soccer_goal g join core.soccer_match m using (match_id)
                    where m.tournament_id = q.tournament_id and g.person_id = q.person_id and g.team_id = q.team_id) gl on true
left join lateral (select count(*) filter (where b.yellow_card)::int as yellow, count(*) filter (where b.red_card or b.sending_off)::int as red
                     from core.soccer_booking b join core.soccer_match m using (match_id)
                    where m.tournament_id = q.tournament_id and b.person_id = q.person_id) bk on true;

create or replace view api.soccer_awards as
select a.tournament_id, t.league_code as league, t.year, a.award, a.award_order, a.person_id, p.full_name as player, a.team_id, tm.name as team, tm.slug as team_slug, a.shared
from core.soccer_award a
join core.soccer_tournament t using (tournament_id)
join core.person p using (person_id)
left join core.soccer_team tm on tm.team_id = a.team_id;

-- one row per tournament a person played in (a player page asks person_id=eq.N)
create or replace view api.soccer_player_tournaments as
select s.person_id, s.tournament_id, s.league, s.year, s.team_id, s.team, s.team_slug, s.shirt_number, s.position_code, s.played, s.started, s.goals, s.yellow, s.red
from api.soccer_squads s;

create or replace view api.soccer_people as
select p.person_id, p.full_name as name, p.kind, p.birth_date, p.nationality_code,
       (select count(*)::int from core.soccer_squad s where s.person_id = p.person_id) as tournaments,
       (select count(*)::int from core.soccer_manager s where s.person_id = p.person_id) as managed
from core.person p
where exists (select 1 from core.soccer_squad s where s.person_id = p.person_id)
   or exists (select 1 from core.soccer_manager s where s.person_id = p.person_id)
   or exists (select 1 from core.soccer_match_referee s where s.person_id = p.person_id);

grant select on api.soccer_team_matches, api.soccer_teams, api.soccer_team_records, api.soccer_tournament_teams, api.soccer_matches,
  api.soccer_scorers, api.soccer_top_scorers, api.soccer_tournaments, api.soccer_standings, api.soccer_lineups, api.soccer_cards,
  api.soccer_substitutions, api.soccer_shootout, api.soccer_match_staff, api.soccer_squads, api.soccer_awards,
  api.soccer_player_tournaments, api.soccer_people to anon, authenticated;

commit;
