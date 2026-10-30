-- what: a baseball franchise identity that still holds a Retrosheet team code db/build/179_abbreviations.sql turns into the fan's code (NYA for NYY, CHN for CHC ...). Any step that rewrites core.franchise_identity (140, 145 and the like) puts the raw codes back, so 179 must be rerun after it
-- baseline: 0
-- needs db/build/179_abbreviations.sql run on DS1 after the last step that wrote core.franchise_identity. Rerunning 140 on 2026-10-27 reset MLB's codes to LAN, NYA and CHN and a bracket showed them.
select i.franchise_identity_id || ' ' || i.full_name || ' ' || i.abbreviation as problem
from core.franchise_identity i
join core.franchise f on f.franchise_id = i.franchise_id and f.sport_code = 'baseball'
where i.abbreviation in ('NYN', 'NYA', 'CHN', 'CHA', 'SLN', 'SDN', 'SFN', 'LAN', 'KCA', 'TBA', 'FLO')
