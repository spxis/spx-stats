-- Put api.stat_reference_new (migration 102) in place of api.stat_reference, in one short transaction: the old copy is dropped, the new one and its
-- index take the old names, select is granted to anon and authenticated, the comment is copied. api.swap_matview() (097) gives up after 5 seconds
-- rather than queue behind a running refresh while readers queue behind it: run this again when no refresh is running. api.refresh() needs no change.
-- Needs 097 and 102.
begin;
set local lock_timeout = '5s';
select api.swap_matview('stat_reference', 'stat_reference_new');
commit;
