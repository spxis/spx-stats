-- FIFA's three-letter codes for the national teams (core.soccer_team.fifa_code). The Fjelstul file (step 200_worldcup) carries ISO 3166 alpha-3 codes
-- for many teams (DZA, DEU, NLD, CHE, PRT ...), not what FIFA writes (ALG, GER, NED, SUI, POR), and one code for both Germanys (DEU) and both Congos
-- (COD). This step sets FIFA's own code, by team_id, for every national team the archive holds (96 on 2026-11-02: the 88 T- teams, the five the 2026
-- file adds, and the three the 2023 Women's World Cup adds). The codes are FIFA's published three-letter country codes (facts, no licence question);
-- the site's table in web/src/lib/soccerLook.ts carried the same codes until this step reaches production. db/tests/soccer-fifa-code.sh checks the
-- two lists agree, that all 96 codes are different, and that a rerun changes nothing.
-- Run after 200_worldcup.sql and 200_wwc2023_from_wikipedia.sql, which write fifa_code on every rerun of theirs. Rerunnable: it updates only the
-- rows whose code differs, changes no other column, adds and deletes no row (no id is touched). A team the archive gains later and this list lacks
-- keeps the source's code until it is added here. No begin or commit of its own, so a dry run (ds1-apply.sh --dry-run) rolls it back.
drop table if exists fifa_code_seed;
create temp table fifa_code_seed (team_id text primary key, code text not null check (code ~ '^[A-Z]{3}$'));
insert into fifa_code_seed (team_id, code) values
 ('T-01', 'ALG'), ('T-02', 'ANG'), ('T-03', 'ARG'), ('T-04', 'AUS'),
 ('T-05', 'AUT'), ('T-06', 'BEL'), ('T-07', 'BOL'), ('T-08', 'BIH'),
 ('T-09', 'BRA'), ('T-10', 'BUL'), ('T-11', 'CMR'), ('T-12', 'CAN'),
 ('T-13', 'CHI'), ('T-14', 'CHN'), ('T-15', 'TPE'), ('T-16', 'COL'),
 ('T-17', 'CRC'), ('T-18', 'CRO'), ('T-19', 'CUB'), ('T-20', 'CZE'),
 ('T-21', 'TCH'), ('T-22', 'DEN'), ('T-23', 'DEI'), ('T-24', 'GDR'),
 ('T-25', 'ECU'), ('T-26', 'EGY'), ('T-27', 'SLV'), ('T-28', 'ENG'),
 ('T-29', 'EQG'), ('T-30', 'FRA'), ('T-31', 'GER'), ('T-32', 'GHA'),
 ('T-33', 'GRE'), ('T-34', 'HAI'), ('T-35', 'HON'), ('T-36', 'HUN'),
 ('T-37', 'ISL'), ('T-38', 'IRN'), ('T-39', 'IRQ'), ('T-40', 'ISR'),
 ('T-41', 'ITA'), ('T-42', 'CIV'), ('T-43', 'JAM'), ('T-44', 'JPN'),
 ('T-45', 'KUW'), ('T-46', 'MEX'), ('T-47', 'MAR'), ('T-48', 'NED'),
 ('T-49', 'NZL'), ('T-50', 'NGA'), ('T-51', 'PRK'), ('T-52', 'NIR'),
 ('T-53', 'NOR'), ('T-54', 'PAN'), ('T-55', 'PAR'), ('T-56', 'PER'),
 ('T-57', 'POL'), ('T-58', 'POR'), ('T-59', 'QAT'), ('T-60', 'IRL'),
 ('T-61', 'ROU'), ('T-62', 'RUS'), ('T-63', 'KSA'), ('T-64', 'SCO'),
 ('T-65', 'SEN'), ('T-66', 'SRB'), ('T-67', 'SCG'), ('T-68', 'SVK'),
 ('T-69', 'SVN'), ('T-70', 'RSA'), ('T-71', 'KOR'), ('T-72', 'URS'),
 ('T-73', 'ESP'), ('T-74', 'SWE'), ('T-75', 'SUI'), ('T-76', 'THA'),
 ('T-77', 'TOG'), ('T-78', 'TRI'), ('T-79', 'TUN'), ('T-80', 'TUR'),
 ('T-81', 'UKR'), ('T-82', 'UAE'), ('T-83', 'USA'), ('T-84', 'URU'),
 ('T-85', 'WAL'), ('T-86', 'FRG'), ('T-87', 'YUG'), ('T-88', 'ZAI'),
 ('X-cape-verde', 'CPV'), ('X-curacao', 'CUW'), ('X-dr-congo', 'COD'), ('X-jordan', 'JOR'),
 ('X-philippines', 'PHI'), ('X-uzbekistan', 'UZB'), ('X-vietnam', 'VIE'), ('X-zambia', 'ZAM');

update core.soccer_team t set fifa_code = s.code
from fifa_code_seed s
where t.team_id = s.team_id and t.fifa_code is distinct from s.code;

drop table fifa_code_seed;
