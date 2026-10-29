-- A small NHL for the ECHL affiliation test (db/tests/echl-from-wikipedia.sh): every NHL franchise with its names and abbreviations by date, as api.franchise_names and
-- api.team_abbr give them (read from the preview PostgREST on 2026-10-29). Only what the ECHL's affiliation step reads: the franchise, its NHL membership, its identities.
insert into ref.sport (sport_code, name) values ('hockey', 'Ice hockey') on conflict do nothing;
insert into ref.league (league_code, sport_code, country_code) values ('nhl', 'hockey', 'US') on conflict do nothing;
create temp table nhl_name (fid int, name text, d0 date, d1 date, abbr text);
insert into nhl_name values
  (1637, 'St. Louis Eagles', '1934-07-01', '1935-07-01', 'SLE'),
  (1637, 'Ottawa Hockey Club', '1909-07-01', '1912-07-01', null),
  (1411, 'Minnesota North Stars', '1967-07-01', '1993-07-01', 'MNS'),
  (1412, 'Detroit Cougars', '1926-07-01', '1930-07-01', 'DCG'),
  (1412, 'Detroit Falcons', '1930-07-01', '1932-07-01', 'DFL'),
  (1412, 'Detroit Red Wings', '1932-07-01', null, 'DET'),
  (1413, 'Edmonton Oilers', '1979-07-01', null, 'EDM'),
  (1414, 'Florida Panthers', '1993-07-01', null, 'FLA'),
  (1415, 'Los Angeles Kings', '1967-07-01', null, 'LAK'),
  (1416, 'Montréal Canadiens', '1917-07-01', null, 'MTL'),
  (1417, 'Nashville Predators', '1998-07-01', null, 'NSH'),
  (1418, 'Colorado Rockies', '1976-07-01', '1982-07-01', 'CLR'),
  (1418, 'New Jersey Devils', '1982-07-01', null, 'NJD'),
  (1419, 'New York Islanders', '1972-07-01', null, 'NYI'),
  (1420, 'New York Rangers', '1926-07-01', null, 'NYR'),
  (1421, 'Ottawa Senators', '1992-07-01', null, 'OTT'),
  (1422, 'Philadelphia Flyers', '1967-07-01', null, 'PHI'),
  (1423, 'Winnipeg Jets', '1979-07-01', '1996-07-01', 'WIN'),
  (1423, 'Phoenix Coyotes', '1996-07-01', '2014-07-01', 'PHX'),
  (1423, 'Arizona Coyotes', '2014-07-01', '2024-07-01', 'ARI'),
  (1424, 'Pittsburgh Penguins', '1967-07-01', null, 'PIT'),
  (1425, 'San Jose Sharks', '1991-07-01', null, 'SJS'),
  (1426, 'St. Louis Blues', '1967-07-01', null, 'STL'),
  (1427, 'Tampa Bay Lightning', '1992-07-01', null, 'TBL'),
  (1428, 'Toronto Arenas', '1917-07-01', '1919-07-01', 'TAN'),
  (1428, 'Toronto St. Patricks', '1919-07-01', '1927-07-01', 'TSP'),
  (1428, 'Toronto Maple Leafs', '1927-07-01', null, 'TOR'),
  (1429, 'Vancouver Canucks', '1970-07-01', null, 'VAN'),
  (1430, 'Washington Capitals', '1974-07-01', null, 'WSH'),
  (1490, 'Columbus Blue Jackets', '2000-07-01', null, 'CBJ'),
  (1639, 'New York Americans', '1925-07-01', '1941-07-01', 'NYA'),
  (1639, 'Brooklyn Americans', '1941-07-01', '1942-07-01', 'BRK'),
  (1491, 'Minnesota Wild', '2000-07-01', null, 'MIN'),
  (1634, 'Oakland Seals', '1967-07-01', '1970-07-01', 'OAK'),
  (1634, 'California Golden Seals', '1970-07-01', '1976-07-01', 'CGS'),
  (1636, 'Pittsburgh Pirates', '1925-07-01', '1930-07-01', 'PIR'),
  (1638, 'Vegas Golden Knights', '2017-07-01', null, 'VGK'),
  (1639, 'Quebec Bulldogs', '1919-07-01', '1920-07-01', 'QBD'),
  (1639, 'Hamilton Tigers', '1920-07-01', '1925-07-01', 'HAM'),
  (1641, 'Seattle Kraken', '2021-07-01', null, 'SEA'),
  (1833, 'Utah Hockey Club', '2024-07-01', '2025-07-01', 'UTA'),
  (1833, 'Utah Mammoth', '2025-07-01', null, 'UTA'),
  (1413, 'Edmonton Oilers', '1973-07-01', '1979-07-01', null),
  (1410, 'Quebec Nordiques', '1972-07-01', '1979-07-01', null),
  (1423, 'Winnipeg Jets', '1972-07-01', '1979-07-01', null),
  (1416, 'Montreal Canadiens', '1909-07-01', '1917-07-01', null),
  (1413, 'Alberta Oilers', '1972-07-01', '1973-07-01', null),
  (1639, 'Quebec Bulldogs', '1910-07-01', '1917-07-01', null),
  (1408, 'New England Whalers', '1972-07-01', '1979-07-01', null),
  (1403, 'Anaheim Ducks', '1993-07-01', null, 'ANA'),
  (1404, 'Winnipeg Jets', '2011-07-01', null, 'WPG'),
  (1405, 'Boston Bruins', '1924-07-01', null, 'BOS'),
  (1406, 'Buffalo Sabres', '1970-07-01', null, 'BUF'),
  (1407, 'Calgary Flames', '1980-07-01', null, 'CGY'),
  (1408, 'Hartford Whalers', '1979-07-01', '1997-07-01', 'HFD'),
  (1404, 'Atlanta Thrashers', '1999-07-01', '2011-07-01', 'ATL'),
  (1407, 'Atlanta Flames', '1972-07-01', '1980-07-01', 'AFM'),
  (1418, 'Kansas City Scouts', '1974-07-01', '1976-07-01', 'KCS'),
  (1637, 'Ottawa Senators', '1917-07-01', '1932-07-01', 'SEN'),
  (1637, 'Ottawa Senators', '1932-07-01', '1934-07-01', 'SEN'),
  (1640, 'Montreal Wanderers', '1909-07-01', '1917-07-01', null),
  (1640, 'Montreal Wanderers', '1917-07-01', '1918-07-01', 'MWN'),
  (1408, 'Carolina Hurricanes', '1997-07-01', null, 'CAR'),
  (1409, 'Chicago Blackhawks', '1926-07-01', null, 'CHI'),
  (1410, 'Quebec Nordiques', '1979-07-01', '1995-07-01', 'QUE'),
  (1410, 'Colorado Avalanche', '1995-07-01', null, 'COL'),
  (1411, 'Dallas Stars', '1993-07-01', null, 'DAL'),
  (1634, 'Cleveland Barons', '1976-07-01', '1978-07-01', 'CLE'),
  (1635, 'Montreal Maroons', '1924-07-01', '1938-07-01', 'MMR'),
  (1636, 'Philadelphia Quakers', '1930-07-01', '1931-07-01', 'QUA'),
  (1637, 'Ottawa Senators', '1912-07-01', '1917-07-01', null);
do $$
declare r record; new_id int;
begin
  for r in select z.fid as k, min(z.d0) as d0, case when bool_or(z.d1 is null) then null else max(z.d1) end as d1 from nhl_name z group by z.fid loop
    insert into core.franchise (sport_code, source_key) values ('hockey', 'nhlfix:' || r.k) returning franchise_id into new_id;
    insert into core.franchise_league (franchise_id, league_code, valid_during) values (new_id, 'nhl', daterange(r.d0, r.d1));
    insert into core.franchise_identity (franchise_id, valid_during, location, nickname, full_name, abbreviation, country_code)
      select new_id, daterange(n.d0, n.d1), split_part(n.name, ' ', 1), 'Club', n.name, n.abbr, 'US' from nhl_name n where n.fid = r.k;
  end loop;
end $$;
