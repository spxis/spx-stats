-- Award winners as read from Wikipedia's award articles (CC BY-SA 4.0): one row per
-- winner as the article's table or list names them, kept by award. The archive of
-- what was read is scripts/wikipedia_awards/ (fetch.py, extract.py, load.py).
create schema if not exists legacy_wikipedia_awards;
comment on schema legacy_wikipedia_awards is 'Award winners read from en.wikipedia.org award articles. CC BY-SA 4.0.';

-- A comparison key for a name: lower case, accents folded, letters and digits only.
create or replace function legacy_wikipedia_awards.name_key(text) returns text
language sql immutable parallel safe as $$
  select regexp_replace(translate(lower($1), 'àáâãäåāăąçćčďđéèêëēěęğíìîïīıłñńňóòôõöøōőřśšşșťţúùûüūůűýÿžźż', 'aaaaaaaaacccddeeeeeeegiiiiiilnnnoooooooorssssttuuuuuuuyyzzz'), '[^a-z0-9]', '', 'g')
$$;

create table legacy_wikipedia_awards.article (
  award_code        text primary key,           -- core.award.code
  title             text not null,              -- the Wikipedia article read
  url               text not null,
  fetched_on        date not null,
  licence           text not null,
  winners_are_teams boolean not null            -- a championship or team award: the winner is a team
);

create table legacy_wikipedia_awards.winner (
  award_code   text not null references legacy_wikipedia_awards.article,
  row_number   integer not null,                -- order read from the article
  source_table integer,                         -- which table of the article (null for a list)
  source_row   integer,                         -- the row in that table (the line in a list)
  season_start integer not null,                -- start year of the season: NHL and NBA span two years, the rest are named by the year played
  year_text    text,                            -- the year cell as the article prints it
  winner_name  text not null,                   -- the person, or the team for a championship
  team_name    text,                            -- the person's team, as printed
  position     text,
  group_label  text,                            -- league (American, National) when the article splits by league
  primary key (award_code, row_number)
);
create index on legacy_wikipedia_awards.winner (season_start);
