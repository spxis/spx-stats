-- Scratch-only extension for exercising ref.position rebuild and QID-first mapping.
create table ref.position_code(code text primary key);
create table ref.position(
  league_code text not null, code text not null, sort int not null, grp text not null,
  name_en text not null, name_fr text not null, name_ja text not null,
  primary key(league_code, code)
);
insert into ref.position_alias(source_code,league_code,raw_value,ord,code) values
  ('external','nba','preserve-me',1,'SG'),
  ('wikidata','soccer','q273199',1,'external-code');
insert into core.person(person_id,full_name,primary_position,positions) values
  (51,'QID beats label',null,null),
  (52,'Unknown QID',null,null),
  (53,'Keep current position','C',array['C']),
  (54,'Unsupported football role',null,null),
  (55,'Unknown role but position already held',null,null),
  (56,'Combo guard',null,null);
insert into core.external_id(entity_kind,entity_id,source_id,external_key) values
  ('person',51,1,'Q151'),('person',52,1,'Q152'),('person',53,1,'Q153'),('person',54,1,'Q154'),
  ('person',55,1,'Q155'),('person',56,1,'Q156');
insert into core.player_season_stat(person_id,team_season_id) values (51,1),(52,1),(53,1),(54,1),(55,1),(56,1);
insert into core.season(season_id,league_code,start_year) values (2,'nhl',2020);
insert into core.team_season(team_season_id,season_id) values (2,2);
insert into core.player_season_stat(person_id,team_season_id) values (54,2);
insert into legacy_wikidata_harvest.item(qid,label) values
  ('Q900','Point guard'),('Q901','Mysterious role'),('Q902','Midfielder'),
  ('Q903','Unmapped position'),('Q904','Combo guard');
insert into legacy_wikidata_harvest.claim(qid,prop,n,rank,value_qid) values
  ('Q151','P413',0,'normal','Q273199'),
  ('Q152','P413',0,'normal','Q901'),
  ('Q153','P413',0,'normal','Q273199'),
  ('Q154','P413',0,'normal','Q902'),
  ('Q155','P413',0,'normal','Q903'),
  ('Q156','P413',0,'normal','Q1113709');
insert into legacy_wikidata_harvest.item(qid,label) values ('Q1113709','Combo guard');
