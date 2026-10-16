-- Post-build assertions for the synthetic edge cases.
do $$ begin
  if (select count(*) from core.person where person_id in (11,12) and birth_place is not null) <> 0 then
    raise exception 'unsupported birthplace alternative was discarded';
  end if;
  if (select count(*) from core.person where person_id=13 and weight_kg is not null) <> 0 then
    raise exception 'unsupported mass unit alternative was discarded';
  end if;
  if (select count(*) from core.person where person_id=14 and nationality_code is not null) <> 0 then
    raise exception 'null citizenship alternative was discarded';
  end if;
  if (select count(*) from core.person where person_id=16 and birth_country_code is not null) <> 0 then
    raise exception 'null birthplace-country alternative was discarded';
  end if;
  if not exists(select 1 from core.person where person_id=15 and primary_position is null and positions=array['C']) then
    raise exception 'partial positions were overwritten';
  end if;
  if exists(select 1 from (values
        ('wikidata-enrichment:Q111:P19:ambiguous'),
        ('wikidata-enrichment:Q112:P19:ambiguous'),
        ('wikidata-enrichment:Q113:P2067:ambiguous'),
        ('wikidata-enrichment:Q114:P27:ambiguous'),
        ('wikidata-enrichment:Q115:P413:positions-conflict'),
        ('wikidata-enrichment:Q116:P17:birth-country-ambiguous')) expected(entity_key)
      where not exists(select 1 from meta.data_issue i where i.entity_kind='person_wikidata_enrichment' and i.entity_key=expected.entity_key)) then
    raise exception 'expected review issue missing: %', (select array_agg(expected.entity_key) from (values
        ('wikidata-enrichment:Q111:P19:ambiguous'),
        ('wikidata-enrichment:Q112:P19:ambiguous'),
        ('wikidata-enrichment:Q113:P2067:ambiguous'),
        ('wikidata-enrichment:Q114:P27:ambiguous'),
        ('wikidata-enrichment:Q115:P413:positions-conflict'),
        ('wikidata-enrichment:Q116:P17:birth-country-ambiguous')) expected(entity_key)
      where not exists(select 1 from meta.data_issue i where i.entity_kind='person_wikidata_enrichment' and i.entity_key=expected.entity_key));
  end if;
  if not exists(select 1 from meta.data_issue where entity_kind='game' and entity_key='unrelated:game:1') then
    raise exception 'unrelated data issue was removed';
  end if;
end $$;
