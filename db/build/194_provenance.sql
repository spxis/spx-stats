-- The provenance counts (api.provenance, migration 056) are worked out from core and meta.verification, so they are refreshed after a core rebuild. Rerunnable.
-- Refresh with `concurrently` (readers carry on; needs the unique index of migration 097), never a plain refresh or a drop + create in place; see 190 and AGENTS.md section 8.
refresh materialized view concurrently api.provenance;
analyze api.provenance;
