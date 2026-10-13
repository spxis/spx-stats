-- The provenance counts (api.provenance, migration 056) are worked out from core and meta.verification, so they are refreshed after a core rebuild. Rerunnable.
refresh materialized view api.provenance;
analyze api.provenance;
