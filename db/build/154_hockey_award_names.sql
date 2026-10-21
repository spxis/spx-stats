-- The PCHA champion got the Paterson Cup (from 1912): the award is named after it, as the NHA's is after the O'Brien Cup and the WHA's after the Avco World Trophy.
-- Runs after 154_hockey_rivals_from_wikipedia.sql (which makes the award). Rerunnable; changes core.award only.
update core.award
set name = 'Paterson Cup',
    description = 'The PCHA''s championship trophy, the Paterson Cup (1911-12 to 1923-24): the regular-season leader, or the winner of the playoff the league held.'
where code = 'pcha_championship' and name <> 'Paterson Cup';
