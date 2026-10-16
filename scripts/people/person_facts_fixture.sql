create schema meta; create schema ref; create schema core; create schema legacy_wikidata_harvest;
create table meta.source(source_id smallint primary key,code text unique not null);
create table meta.data_issue(data_issue_id bigint generated always as identity primary key,source_id smallint,entity_kind text not null,entity_key text not null,issue text not null,resolution text,found_at timestamptz default now(),resolved_at timestamptz);
create table ref.country(country_code text primary key,name text not null);
create table ref.position_alias(source_code text,league_code text,raw_value text,ord int,code text);
create table core.person(person_id bigint primary key,full_name text not null,birth_date date,death_date date,birth_place text,birth_country_code text,nationality_code text,height_cm smallint,weight_kg smallint,primary_position text,positions text[],updated_at timestamptz default now());
create table core.external_id(entity_kind text,entity_id bigint,source_id smallint,external_key text);
create table core.season(season_id int,league_code text,start_year int);
create table core.team_season(team_season_id int,season_id int);
create table core.roster_stint(person_id bigint,team_season_id int,role text);
create table core.player_season_stat(person_id bigint,team_season_id int);
create table core.award_winner(person_id bigint,season_id int);
create table legacy_wikidata_harvest.item(qid text primary key,label text);
create table legacy_wikidata_harvest.claim(qid text,prop text,n int,rank text,value_qid text,value_on date,value_prec smallint,value_num numeric,unit_qid text,value_text text);
insert into meta.source values(1,'wikidata');
insert into ref.country values('CA','Canada'),('US','United States');
insert into ref.position_alias values('wikidata','nba','point guard',1,'PG');
insert into core.person(person_id,full_name,birth_date,birth_place,birth_country_code,nationality_code,height_cm,weight_kg,primary_position,positions) values
(1,'Exact Date',null,null,null,null,null,null,null,null),
(2,'Coarse Conflict',null,null,null,null,null,null,null,null),
(3,'Death Date',null,null,null,null,null,null,null,null),
(4,'Birthplace',null,null,null,null,null,null,null,null),
(5,'Citizenship',null,null,null,null,null,null,null,null),
(6,'Measurements',null,null,null,null,null,null,null,null),
(7,'Position',null,null,null,null,null,null,null,null),
(8,'Do Not Overwrite','1970-01-01',null,null,null,null,null,null,null),
(9,'Ambiguous Place',null,null,null,null,null,null,null,null),
(10,'Place Conflict',null,'Old town','US',null,null,null,null,null);
insert into core.external_id select 'person',person_id,1,'Q'||(100+person_id) from core.person;
insert into core.season values(1,'nba',2020); insert into core.team_season values(1,1); insert into core.player_season_stat values(7,1);
insert into legacy_wikidata_harvest.item values
('Q200','New town'),('Q201','Other town'),('Q300','Canada'),('Q400','Point guard');
insert into legacy_wikidata_harvest.claim(qid,prop,n,rank,value_qid,value_on,value_prec,value_num,unit_qid,value_text) values
('Q101','P569',0,'normal',null,'1980-01-02',11,null,null,null),
('Q101','P569',1,'normal',null,'1980-01-02',11,null,null,null),
('Q102','P569',0,'normal',null,'1980-01-02',11,null,null,null),
('Q102','P569',1,'normal',null,'1980-01-01',9,null,null,null),
('Q103','P570',0,'normal',null,'2020-05-06',11,null,null,null),
('Q104','P19',0,'normal','Q200',null,null,null,null,null),
('Q200','P17',0,'normal','Q300',null,null,null,null,null),
('Q300','P297',0,'normal',null,null,null,null,null,'CA'),
('Q105','P27',0,'normal','Q300',null,null,null,null,null),
('Q106','P2048',0,'normal',null,null,null,1.8,'Q11573',null),
('Q106','P2067',0,'normal',null,null,null,80,'Q11570',null),
('Q107','P413',0,'normal','Q400',null,null,null,null,null),
('Q108','P569',0,'normal',null,'1972-04-03',11,null,null,null),
('Q109','P19',0,'normal','Q200',null,null,null,null,null),
('Q109','P19',1,'normal','Q201',null,null,null,null,null),
('Q110','P19',0,'normal','Q200',null,null,null,null,null);
insert into meta.data_issue(source_id,entity_kind,entity_key,issue,resolution) values
(1,'person_wikidata_enrichment','wikidata-enrichment:Q999:P569:ambiguous','stale owned issue','review'),
(1,'game','unrelated:game:1','unrelated issue','keep');
