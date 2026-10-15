-- How a team logo is fitted into the site's logo boxes (a circle, a square, a table cell).
-- One row per logo image, keyed by the image file as it appears in core.franchise_brand.logo_url
-- ('commons:BluesWordmark.gif', 'en:Los_Angeles_Kings_2024_Logo.svg': the wiki and the file name in the URL).
-- A logo with no row is drawn as it always was. Filled by db/build/175_team_logo_fit.sql from db/seed/logo_fit.csv.
--   wordmark      the image is a wordmark (the club's name in letters): too wide for a table cell or a circle on its own.
--   mark_url ...  the club's primary mark (a Wikimedia Commons file, licence in mark_licence, page in mark_page), drawn instead of
--                 the logo in circles, squares and table cells; the full logo stays where there is room (a team page's title).
--   scale, dx, dy how the picture sits in its circle or square: 1 is the box less its padding, dx and dy move it by that
--                 many percent of the box (right, down).
--   bg            the tile behind it: 'auto' (the theme's), 'light', 'dark' or a team colour as six hex digits.
--   status        proposed (shown only on /admin/logos) or approved (shown on the site) or rejected.
-- The site reads api.logo_fit and draws nothing differently while the view or the rows are missing.
-- On production: apply this file, then a data release of core.logo_fit (AGENTS.md section 8, item 5). Add only; rerunnable.

-- The key of a logo URL: the wiki and the file name inside it. The site's lib/logoFit.ts logoKey() does the same.
create or replace function core.logo_file(url text) returns text language sql immutable parallel safe as $$
  select m[1] || ':' || m[2] from regexp_match(url, '/wikipedia/([^/]+)/(?:thumb/)?[0-9a-f]/[0-9a-f]{2}/([^/?]+)') m
$$;

create table if not exists core.logo_fit (
  logo_file    text primary key check (logo_file ~ '^[a-z]+:[^/?]+$'),
  league_code  text,
  team         text not null,
  wordmark     boolean not null default false,
  mark_url     text,
  mark_licence text,
  mark_page    text,
  scale        numeric(4,2) not null default 1 check (scale between 0.3 and 3),
  dx           numeric(5,1) not null default 0 check (dx between -50 and 50),
  dy           numeric(5,1) not null default 0 check (dy between -50 and 50),
  bg           text not null default 'auto' check (bg in ('auto', 'light', 'dark') or bg ~ '^[0-9A-F]{6}$'),
  status       text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected')),
  note         text,
  check (mark_url is null or (mark_licence is not null and mark_page is not null))
);
comment on table core.logo_fit is 'How a team logo is fitted into the site''s circle, square and table-cell boxes: primary-mark variant, scale, nudge, background, wordmark flag, with a review status.';

create or replace view api.logo_fit as
select logo_file, league_code as league, team, wordmark, mark_url, mark_licence, mark_page, scale, dx, dy, bg, status, note
from core.logo_fit;
grant select on api.logo_fit to anon, authenticated;
