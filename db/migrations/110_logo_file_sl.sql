-- The key of a logo URL for core.logo_fit, now also for the SportsLogos.Net files the site serves itself (migration 108):
-- '/team-logos/sl/5044.gif' is 'sl:5044.gif', next to 'commons:BluesWordmark.gif' and 'en:Los_Angeles_Kings_2024_Logo.svg'. The site's
-- lib/logoFit.ts logoKey() does the same. Replaces the function of migration 107 (same signature); add only, rerunnable.
create or replace function core.logo_file(url text) returns text language sql immutable parallel safe as $$
  select coalesce(
    (select m[1] || ':' || m[2] from regexp_match(url, '/wikipedia/([^/]+)/(?:thumb/)?[0-9a-f]/[0-9a-f]{2}/([^/?]+)') m),
    (select 'sl:' || m[1] from regexp_match(url, '^/team-logos/sl/([^/?]+)$') m))
$$;
