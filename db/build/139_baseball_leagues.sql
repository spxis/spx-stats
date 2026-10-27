-- The baseball family: the leagues Retrosheet's game logs hold besides the American and National Leagues, each a league of its own under MLB.
-- The National Association (1871-75; MLB does not recognise it as a major league), the American Association (1882-91), the Union Association (1884),
-- the Players' League (1890) and the Federal League (1914-15). Step 140 puts every game in the season of its own league; the winners of their pennants
-- are written by step 167. Each league's records are its own and are never added to MLB's. Rerunnable. Runs before 140.
begin;

insert into ref.league (league_code, sport_code, country_code, founded_on, dissolved_on, notes) values
  ('na', 'baseball', 'US', date '1871-03-17', null, 'National Association of Professional Base Ball Players, 1871-75; its Boston, Chicago and Philadelphia clubs went on to the National League. MLB does not recognise it as a major league'),
  ('aa', 'baseball', 'US', null, null, 'American Association, 1882-91; four of its clubs joined the National League for 1892 (the Cardinals, Reds, Dodgers and Pirates play on)'),
  ('ua', 'baseball', 'US', null, null, 'Union Association, 1884, a single season'),
  ('pl', 'baseball', 'US', null, null, 'Players'' League, 1890, a single season'),
  ('fl', 'baseball', 'US', null, null, 'Federal League, 1914-15; played as a major league in both seasons')
on conflict (league_code) do nothing;
insert into ref.league_name (league_code, valid_during, name, short_name) values
  ('na', daterange(null, null), 'National Association of Professional Base Ball Players', 'NA'),
  ('aa', daterange(null, null), 'American Association', 'AA'),
  ('ua', daterange(null, null), 'Union Association', 'UA'),
  ('pl', daterange(null, null), 'Players'' League', 'PL'),
  ('fl', daterange(null, null), 'Federal League', 'FL')
on conflict do nothing;

select league_code, count(*) as names from ref.league_name where league_code in ('na', 'aa', 'ua', 'pl', 'fl') group by 1 order by 1;
commit;
