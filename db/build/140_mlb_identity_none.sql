-- Retrosheet writes '(none)' as the nickname of the 1882-84 Allegheny Club. Step 140 now stores an empty nickname and the name "Allegheny Club";
-- this step repairs a database built before that, in place, so franchise_identity_id and team_season links stay. Rerunnable.
update core.franchise_identity
set nickname = '',
    full_name = btrim(regexp_replace(full_name, '\s*\(none\)\s*$', ''))
where nickname = '(none)' or full_name ~ '\(none\)\s*$';
