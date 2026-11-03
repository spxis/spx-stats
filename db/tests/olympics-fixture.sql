-- People for db/tests/olympics.sh. The Wikidata items are the ones in db/tests/olympics-raw/titles-001.json.
--   Usain Bolt (Q1189), Carl Lewis (Q131237), Shelly-Ann Fraser (Q2253): matched through the Wikidata id.
--   Ben Johnson: the article's item Q52614 was merged into Q52615 (legacy_rosters.redirect), which is the person of core: the merged item is followed.
--   Walter Dix (Q331093): the person of that item is born in 1999, a person born after the Games less 10 years is refused (shown as text).
--   Alain Bernard (Q297477): the swimming article; Eamon Sullivan and the other swimmers have no person and stay text.
--   Vicente de Lima: a person of that name exists but has no Wikidata id: the name alone never matches.
insert into core.person (full_name, birth_date, death_date) values
 ('Usain Bolt', '1986-08-21', null),
 ('Carl Lewis', '1961-07-01', null),
 ('Shelly-Ann Fraser-Pryce', '1986-12-27', null),
 ('Ben Johnson', '1961-12-30', null),
 ('Walter Dix', '1999-01-31', null),
 ('Vicente de Lima', '1979-01-01', null),
 ('Alain Bernard', '1983-05-01', null);
insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'person', p.person_id, (select source_id from meta.source where code = 'wikidata'), q.qid
from (values ('Usain Bolt', 'Q1189'), ('Carl Lewis', 'Q131237'), ('Shelly-Ann Fraser-Pryce', 'Q2253'), ('Ben Johnson', 'Q52615'), ('Walter Dix', 'Q331093'), ('Alain Bernard', 'Q297477')) q(name, qid)
join core.person p on p.full_name = q.name;
insert into legacy_rosters.redirect (from_qid, to_qid) values ('Q52614', 'Q52615');
