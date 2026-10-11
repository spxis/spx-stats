-- Official team abbreviations. Rerunnable; runs after every step that writes core.franchise_identity.
-- NHL, MLB and NFL come with the sources; this shows MLB's Retrosheet codes the way fans write them and fills
-- the NBA and the CFL, which have none, by the identity's location and nickname.

update core.franchise_identity i set abbreviation = a.fan
from core.franchise f,
     (values ('NYN','NYM'),('NYA','NYY'),('CHN','CHC'),('CHA','CWS'),('SLN','STL'),('SDN','SD'),('SFN','SF'),
             ('LAN','LAD'),('KCA','KC'),('TBA','TB'),('FLO','FLA')) as a(retro, fan)
where f.franchise_id = i.franchise_id and f.sport_code = 'baseball' and i.abbreviation = a.retro;

update core.franchise_identity i set abbreviation = a.code
from core.franchise f,
     (values
       ('Tri-Cities','Blackhawks','TRI'),('Milwaukee','Hawks','MLH'),('St. Louis','Hawks','STL'),('Atlanta','Hawks','ATL'),
       ('Boston','Celtics','BOS'),('New Orleans','Hornets','NOH'),('New Orleans','Pelicans','NOP'),('Chicago','Bulls','CHI'),
       ('Cleveland','Cavaliers','CLE'),('Dallas','Mavericks','DAL'),('Denver','Nuggets','DEN'),('Fort Wayne','Pistons','FWP'),
       ('Detroit','Pistons','DET'),('Philadelphia','Warriors','PHW'),('San Francisco','Warriors','SFW'),
       ('Golden State','Warriors','GSW'),('San Diego','Rockets','SDR'),('Houston','Rockets','HOU'),('Indiana','Pacers','IND'),
       ('Buffalo','Braves','BUF'),('San Diego','Clippers','SDC'),('Los Angeles','Clippers','LAC'),('L.A. Clippers','Clippers','LAC'),
       ('Minneapolis','Lakers','MNL'),('Los Angeles','Lakers','LAL'),('L.A. Lakers','Lakers','LAL'),('Miami','Heat','MIA'),
       ('Milwaukee','Bucks','MIL'),('Minnesota','Timberwolves','MIN'),('New York','Nets','NYN'),('New Jersey','Nets','NJN'),
       ('Brooklyn','Nets','BKN'),('New York','Knicks','NYK'),('Orlando','Magic','ORL'),('Syracuse','Nationals','SYR'),
       ('Philadelphia','76ers','PHI'),('Philadelphia','Sixers','PHI'),('Phoenix','Suns','PHX'),('Portland','Trail Blazers','POR'),
       ('Portland','Blazers','POR'),('Rochester','Royals','ROC'),('Cincinnati','Royals','CIN'),('Kansas City–Omaha','Kings','KCO'),
       ('Kansas City','Kings','KCK'),('Sacramento','Kings','SAC'),('San Antonio','Spurs','SAS'),('Seattle','SuperSonics','SEA'),
       ('Seattle','Sonics','SEA'),('Oklahoma City','Thunder','OKC'),('Toronto','Raptors','TOR'),('New Orleans','Jazz','NOJ'),
       ('Utah','Jazz','UTA'),('Vancouver','Grizzlies','VAN'),('Memphis','Grizzlies','MEM'),('Chicago','Packers','CHP'),
       ('Chicago','Zephyrs','CHZ'),('Baltimore','Bullets','BAL'),('Capital','Bullets','CAP'),('Washington','Bullets','WSB'),
       ('Washington','Wizards','WAS'),('Charlotte','Hornets','CHA'),('Charlotte','Bobcats','CHA'),('Pittsburgh','Ironmen','PIT'),
       ('Cleveland','Rebels','CLR'),('Indianapolis','Jets','INJ'),('Anderson','Packers','AND'),('Toronto','Huskies','TRH'),
       ('Providence','Steamrollers','PRO'),('Washington','Capitols','WSC'),('Indianapolis','Olympians','INO'),
       ('St. Louis','Bombers','SLB'),('Sheboygan','Red Skins','SHE'),('Waterloo','Hawks','WAT'),('Detroit','Falcons','DTF'),
       ('Chicago','Stags','CHS')
     ) as a(location, nickname, code)
where f.franchise_id = i.franchise_id and f.sport_code = 'basketball' and i.abbreviation is null
  and a.location = i.location and a.nickname = i.nickname;

-- The first Charlotte Hornets (1988-2002) were CHH; the second (2014 on) are CHA.
update core.franchise_identity i set abbreviation = 'CHH'
from core.franchise f
where f.franchise_id = i.franchise_id and f.sport_code = 'basketball' and i.location = 'Charlotte'
  and i.nickname = 'Hornets' and lower(i.valid_during) < date '2002-10-01';

update core.franchise_identity i set abbreviation = a.code
from core.franchise f,
     (values ('Montreal','MTL'),('Hamilton','HAM'),('Ottawa','OTT'),('Toronto','TOR'),('Winnipeg','WPG'),('Edmonton','EDM'),
             ('Saskatchewan','SSK'),('Calgary','CGY'),('BC','BC'),('B.C.','BC'),('Birmingham','BIR'),('Sacramento','SAC'),
             ('San Antonio','SA'),('Las Vegas','LV'),('Shreveport','SHR'),('Baltimore','BAL'),('Memphis','MEM')) as a(location, code)
where f.franchise_id = i.franchise_id and f.sport_code = 'canadian_football' and i.abbreviation is null
  and a.location = i.location;
