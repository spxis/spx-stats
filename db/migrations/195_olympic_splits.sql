-- Swimming splits of the Olympic event articles: the loader keeps what the article prints as a list of {"m": metres reached, "s": seconds} (an interval column such as
-- 50-65 m is {"m": 65, "from": 50, "s": seconds, "interval": true}). legacy_wikipedia_olympics is DS1 only. Add-only; rerunnable.
alter table legacy_wikipedia_olympics.line add column if not exists splits jsonb;
