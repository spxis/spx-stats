-- Names Wikidata gives under "mul" only (db/seed/wikidata_label.csv, CC0). A name that reads the same in every language
-- (a person's, a city's) is stored there instead of under "en", so the first people fetch kept no label for those items
-- and Wikidata's own label service answered the bare id ("Q715377") for them. scripts/people/fetch.py labels asks for
-- them and writes the seed; this step puts them on legacy_people.item (label only where it is empty), where 170 and 177
-- read names. Run from the repo root, as scripts/build_core.sh does. Rerunnable; changes nothing but empty labels.
begin;

create temp table seed_label (qid text, label text, language text) on commit drop;
\copy seed_label from 'db/seed/wikidata_label.csv' with (format csv, header true)

insert into legacy_people.item (qid, label, enwiki_title, fetched_on)
select s.qid, s.label, null, date '2026-10-15' from seed_label s where s.label !~ '^Q[0-9]+$'
on conflict (qid) do update set label = excluded.label where legacy_people.item.label is null;

select 'labels set from the seed' as what, count(*) as n
from legacy_people.item i join seed_label s using (qid) where i.label = s.label;
commit;
