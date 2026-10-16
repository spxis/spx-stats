-- Synthetic malformed/partial alternatives; never use real people in this fixture.
insert into core.person(person_id,full_name) values
  (11,'Null birthplace alternative'),
  (12,'Unmapped birthplace alternative'),
  (13,'Unsupported mass alternative'),
  (14,'Null citizenship alternative'),
  (16,'Malformed birthplace country');
insert into core.person(person_id,full_name,positions) values (15,'Partial position array',array['C']);
insert into core.external_id(entity_kind,entity_id,source_id,external_key) values
  ('person',11,1,'Q111'),('person',12,1,'Q112'),('person',13,1,'Q113'),
  ('person',14,1,'Q114'),('person',15,1,'Q115'),('person',16,1,'Q116');
insert into core.player_season_stat(person_id,team_season_id) values (15,1);
insert into legacy_wikidata_harvest.item(qid,label) values ('Q202','Another place'),('Q203','Malformed-country place');
insert into legacy_wikidata_harvest.claim(qid,prop,n,rank,value_qid,value_num,unit_qid) values
  ('Q111','P19',0,'normal','Q202',null,null),
  ('Q111','P19',1,'normal',null,null,null),
  ('Q112','P19',0,'normal','Q202',null,null),
  ('Q112','P19',1,'normal','Q999',null,null),
  ('Q113','P2067',0,'normal',null,80,'Q11570'),
  ('Q113','P2067',1,'normal',null,176,'Q828224'),
  ('Q114','P27',0,'normal','Q300',null,null),
  ('Q114','P27',1,'normal',null,null,null),
  ('Q115','P413',0,'normal','Q400',null,null),
  ('Q116','P19',0,'normal','Q203',null,null),
  ('Q203','P17',0,'normal','Q300',null,null),
  ('Q203','P17',1,'normal',null,null,null);
