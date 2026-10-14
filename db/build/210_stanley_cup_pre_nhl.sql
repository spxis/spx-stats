-- The Stanley Cup before the NHL (1893-1917) and its finals up to 1926, into core.cup_series, from legacy_wikipedia_stanley_cup
-- (English Wikipedia, CC BY-SA 4.0; migration 086, scripts/stanley_cup/) and db/seed/stanley_cup_club.csv (which club each printed name
-- is, and the franchise and city core knows it by). Needs migration 087. Run from the repo root, after the NHL is built (100, 145, 165, 172).
--  * A club is linked to a franchise only through the seed (source + source key), never by matching a name.
--  * A final from 1918 on is part of an NHL season: the row points at it (nhl_season_id) and the site does not count it twice.
--  * Montreal HC's win over Queen's on 9 March 1895 is kept but does not count as a title: the trustees had agreed the Victorias would take the Cup.
-- Checks (meta.verification, entity_kind 'cup_series'): 1915-1917 against the article about each final; 1918-1926 against the champion
-- worked out from the NHL's own games (165); 1893-1914 against the article's Appearances table. Disagreements and clubs core cannot show
-- go to meta.data_issue. Safe to run again.
begin;

drop table if exists pg_temp.seed_club;
create temp table seed_club (name text, league text, club text, appearance_club text, franchise_source text, franchise_key text, city text, note text);
\copy seed_club from 'db/seed/stanley_cup_club.csv' with (format csv, header true)

create temp table club as
select c.name, c.league, c.club, c.appearance_club, c.city, f.franchise_id
from seed_club c
left join meta.source s on s.code = c.franchise_source
left join core.franchise f on f.source_id = s.source_id and f.source_key = c.franchise_key and f.sport_code = 'hockey';

delete from meta.verification where entity_kind = 'cup_series';
delete from meta.data_issue where entity_kind = 'cup_series' or entity_kind = 'cup_club';
delete from core.cup_series;

create temp table lg as
select l.*,
       w.club as w_club, w.appearance_club as w_app, w.city as w_city, w.franchise_id as w_f, (w.name is not null) as w_seen,
       o.club as l_club, o.city as l_city, o.franchise_id as l_f, (o.name is not null or l.loser_name is null) as l_seen
from legacy_wikipedia_stanley_cup.series l
left join lateral (select * from club c where c.name = l.winner_name and (c.league = l.winner_league or c.league is null) order by (c.league is not null) desc limit 1) w on true
left join lateral (select * from club c where c.name = l.loser_name and (c.league = l.loser_league or c.league is null) order by (c.league is not null) desc limit 1) o on true;

-- A printed name the seed does not know is a typo or a new club: say so, load nothing for it.
select 'series rows with a club missing from db/seed/stanley_cup_club.csv' as what, count(*) as n from lg where not w_seen or not l_seen having count(*) > 0;

insert into core.cup_series (cup_series_id, cup_year, seq, kind, date_text, played_on, ended_on, winner_name, winner_league, winner_club, winner_franchise_id, winner_city_slug,
                             loser_name, loser_league, loser_club, loser_franchise_id, loser_city_slug, format, score, counts_as_title, nhl_season_id, source_id, source_key)
select l.cup_year * 100 + l.seq, l.cup_year, l.seq, l.kind, l.date_text, l.played_on, l.ended_on, l.winner_name, l.winner_league, l.w_club, l.w_f, l.w_city,
       l.loser_name, l.loser_league, l.l_club, l.l_f, l.l_city, l.format, l.score,
       not (l.cup_year = 1895 and l.kind = 'challenge' and l.winner_name = 'Montreal Hockey Club'),
       case when l.cup_year >= 1918 then (select s.season_id from core.season s where s.league_code = 'nhl' and s.start_year = l.cup_year - 1) end,
       (select source_id from meta.source where code = 'wikipedia'), 'wikipedia:stanley_cup:' || l.cup_year || ':' || l.seq
from lg l where l.w_seen and l.l_seen;

-- 1915-1917, against the article about the final: same winner, same games won by each side.
insert into meta.verification (entity_kind, entity_id, field, status, source_id, evidence_url, their_value)
select 'cup_series', s.cup_series_id, 'winner',
       case when a.team1 = s.winner_name and s.score = a.team1_games || '–' || a.team2_games then 'confirmed'::meta.verification_status else 'disputed'::meta.verification_status end,
       (select source_id from meta.source where code = 'wikipedia'), 'https://en.wikipedia.org/wiki/' || replace(a.article, ' ', '_'),
       a.team1 || ' ' || a.team1_games || '–' || a.team2_games || ' ' || a.team2
from core.cup_series s join legacy_wikipedia_stanley_cup.final_article a on a.cup_year = s.cup_year
where s.kind = 'final';

-- 1918-1926, against the champion worked out from the NHL's playoff games (165): the same franchise.
insert into meta.verification (entity_kind, entity_id, field, status, source_id, evidence_url, their_value)
select 'cup_series', s.cup_series_id, 'winner',
       case when s.winner_franchise_id = ts.franchise_id then 'confirmed'::meta.verification_status else 'disputed'::meta.verification_status end,
       (select source_id from meta.source where code = 'spx_stats_derived'), null, w.winner_name
from core.cup_series s
join core.award a on a.code = 'nhl_stanley_cup'
join core.award_winner w on w.award_id = a.award_id and w.season_id = s.nhl_season_id
join core.team_season ts on ts.team_season_id = w.team_season_id
where s.nhl_season_id is not null and w.source_id = (select source_id from meta.source where code = 'spx_stats_derived');

-- 1893-1914, against the Appearances table of the same article: the club has a bold year (a win) in that calendar year.
create temp table wins as
select s.cup_series_id, s.cup_year, c.appearance_club
from core.cup_series s
join legacy_wikipedia_stanley_cup.series l on l.cup_year = s.cup_year and l.seq = s.seq
join lateral (select * from club k where k.name = l.winner_name and (k.league = l.winner_league or k.league is null) order by (k.league is not null) desc limit 1) c on true
where s.kind in ('challenge', 'league') and c.appearance_club is not null;

insert into meta.verification (entity_kind, entity_id, field, status, source_id, evidence_url, their_value)
select 'cup_series', w.cup_series_id, 'winner',
       case when exists (select 1 from legacy_wikipedia_stanley_cup.appearance a where a.club = w.appearance_club and a.cup_year = w.cup_year and a.won)
            then 'confirmed'::meta.verification_status else 'disputed'::meta.verification_status end,
       (select source_id from meta.source where code = 'wikipedia'), 'https://en.wikipedia.org/wiki/List_of_Stanley_Cup_champions#Appearances',
       w.appearance_club || ' ' || w.cup_year
from wins w;

-- Disagreements.
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'wikipedia'), 'cup_series', 'cup_series:' || s.cup_series_id,
       format('Stanley Cup %s (%s): %s beat %s per the list, but %s', s.cup_year, s.date_text, s.winner_name, coalesce(s.loser_name, 'no one'), v.their_value),
       'Kept as listed by Wikipedia''s list of champions; the other reading is in meta.verification'
from meta.verification v join core.cup_series s on s.cup_series_id = v.entity_id
where v.entity_kind = 'cup_series' and v.status = 'disputed' and s.counts_as_title;  -- the 1895 series is explained below

-- The list and its Appearances table must count the same wins for each club (the challenge-era table prints wins as SC).
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'wikipedia'), 'cup_series', 'cup_series:appearances:' || t.club,
       format('%s: the Appearances table counts %s Cup wins, the list of champions %s', t.club, t.wins, n.n), 'Both kept; check the article'
from legacy_wikipedia_stanley_cup.appearance_total t
join (select c.appearance_club, count(*) as n from core.cup_series s
      join legacy_wikipedia_stanley_cup.series l on l.cup_year = s.cup_year and l.seq = s.seq
      join lateral (select * from club k where k.name = l.winner_name and (k.league = l.winner_league or k.league is null) order by (k.league is not null) desc limit 1) c on true
      where s.kind in ('challenge', 'league') and c.appearance_club is not null group by 1) n on n.appearance_club = t.club
where n.n <> t.wins;

-- The one series that is not a title.
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'wikipedia'), 'cup_series', 'cup_series:' || cup_series_id,
       'Montreal Hockey Club beat Queen''s University 5-1 on 9 March 1895, but the Stanley Cup trustees had agreed that the Montreal Victorias, the AHAC champions, would take the Cup if the Montreal HC won',
       'The series is kept; it is not counted as a title (counts_as_title is false)'
from core.cup_series where not counts_as_title;

-- A club that won the Cup but core holds no franchise for: its title shows on the NHL league page only, not on a team page.
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'wikipedia'), 'cup_club', 'cup_club:' || s.winner_club,
       format('%s won the Stanley Cup (%s) but is not a franchise of core, so no team page can show the title', s.winner_club, string_agg(distinct s.cup_year::text, ', ' order by s.cup_year::text)),
       'Listed on the NHL league page with the other Cup winners before the NHL'
from core.cup_series s where s.counts_as_title and s.nhl_season_id is null and s.winner_franchise_id is null
group by s.winner_club;

select 'series' as k, count(*) from core.cup_series
union all select 'titles (club-years outside NHL seasons)', count(*) from api.cup_title
union all select 'titles linked to a franchise', count(*) from api.cup_title where franchise is not null
union all select 'finals', count(*) from core.cup_series where kind = 'final'
union all select 'in an NHL season', count(*) from core.cup_series where nhl_season_id is not null
union all select 'verification ' || status::text, count(*) from meta.verification where entity_kind = 'cup_series' group by status
union all select 'data issues', count(*) from meta.data_issue where entity_kind in ('cup_series', 'cup_club');
commit;
