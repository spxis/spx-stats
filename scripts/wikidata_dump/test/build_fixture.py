#!/usr/bin/env python3
"""Write test/fixture-dump.json.gz: a tiny Wikidata dump of hand-written entities in the real dump's shape.

  python3 -I scripts/wikidata_dump/test/build_fixture.py            rewrites the file (the tests check it is what this script makes)

The shape is the dump's: line 1 "[", one entity per line ending in ",", last line "]". Entities carry the usual noise (hashes, references,
qualifier order) so that the filter has to ignore it. The numbers are made up, except the few real property and class ids that the
filter itself knows (P31 Q5 human, P641 sport, P106 occupation, P54 team, P166 award, Q1985727 Gregorian, Q1985786 Julian).
Everything a test needs to find is named in the comment next to it.
"""
from __future__ import annotations

import gzip
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "fixture-dump.json.gz"

# occupations (all in occupations.tsv): Q10833314 tennis player, Q11774891 ice hockey player, Q10871364 baseball player, Q41583 coach,
# Q202648 referee; Q106037372 "female athlete" (use=0, a sex marker); Q33999 actor (not a sport occupation)
# sports: Q847 tennis, Q41466 ice hockey, Q5372 baseball
# sensitive targets that must never appear in an output: Q6581072 (a sex value), Q9268 (a religion), Q49085 (an ethnic group),
# Q7000001 (a spouse), Q7000002 (a child), Q7000003 (a party), Q7000004 (a cause of death), Q7000005 (a mother)
SENSITIVE_QIDS = ["Q6581072", "Q9268", "Q49085", "Q7000001", "Q7000002", "Q7000003", "Q7000004", "Q7000005"]


def item_snak(prop: str, qid: str) -> dict:
    return {"snaktype": "value", "property": prop, "hash": "0" * 40,
            "datavalue": {"value": {"entity-type": "item", "numeric-id": int(qid[1:]), "id": qid}, "type": "wikibase-entityid"},
            "datatype": "wikibase-item"}


def time_snak(prop: str, time: str, precision: int, cal: str = "Q1985727") -> dict:
    return {"snaktype": "value", "property": prop, "hash": "1" * 40,
            "datavalue": {"value": {"time": time, "timezone": 0, "before": 0, "after": 0, "precision": precision,
                                    "calendarmodel": f"http://www.wikidata.org/entity/{cal}"}, "type": "time"},
            "datatype": "time"}


def quantity_snak(prop: str, amount: str, unit: str = "http://www.wikidata.org/entity/Q11573") -> dict:
    return {"snaktype": "value", "property": prop, "hash": "2" * 40,
            "datavalue": {"value": {"amount": amount, "unit": unit}, "type": "quantity"}, "datatype": "quantity"}


def string_snak(prop: str, s: str) -> dict:
    return {"snaktype": "value", "property": prop, "hash": "3" * 40, "datavalue": {"value": s, "type": "string"}, "datatype": "string"}


def special_snak(prop: str, kind: str) -> dict:
    return {"snaktype": kind, "property": prop, "hash": "4" * 40, "datatype": "time"}


def stmt(snak: dict, rank: str = "normal", quals: list[dict] | None = None) -> dict:
    s = {"mainsnak": snak, "type": "statement", "id": "Q0$FIXTURE", "rank": rank,
         "references": [{"hash": "5" * 40, "snaks": {"P143": [item_snak("P143", "Q328")]}, "snaks-order": ["P143"]}]}
    if quals:
        s["qualifiers"] = {}
        for q in quals:
            s["qualifiers"].setdefault(q["property"], []).append(q)
        s["qualifiers-order"] = list(s["qualifiers"])
    return s


def claims(*stmts: dict) -> dict:
    out: dict = {}
    for s in stmts:
        out.setdefault(s["mainsnak"]["property"], []).append(s)
    return out


def entity(qid: str, labels: dict, desc: str | None, claim: dict, sitelinks: dict | None = None) -> dict:
    e = {"type": "item", "id": qid, "labels": {k: {"language": k, "value": v} for k, v in labels.items()},
         "descriptions": {"en": {"language": "en", "value": desc}} if desc else {},
         "aliases": {"en": [{"language": "en", "value": "an alias"}]}, "claims": claim,
         "sitelinks": {k: {"site": k, "title": v, "badges": []} for k, v in (sitelinks or {}).items()}, "lastrevid": 1}
    return e


def human(*extra: dict) -> list[dict]:
    return [stmt(item_snak("P31", "Q5")), *extra]


def entities() -> list[dict]:
    e: list[dict] = []
    # Q1001: the full person. Strict match (ice hockey player + sport). Everything sensitive is on it and must vanish.
    e.append(entity("Q1001", {"en": "Alice Skater", "fr": "Alice Patineuse", "ja": "アリス・スケーター", "de": "Alice Eisläufer", "mul": "Alice S."},
                    "Canadian ice hockey player", claims(
        *human(),
        stmt(item_snak("P106", "Q11774891")), stmt(item_snak("P106", "Q106037372")),
        stmt(item_snak("P641", "Q41466")),
        stmt(time_snak("P569", "+1961-01-26T00:00:00Z", 11)),
        stmt(time_snak("P569", "+1960-01-01T00:00:00Z", 9), rank="deprecated"),
        stmt(time_snak("P570", "+1999-00-00T00:00:00Z", 9)),
        stmt(item_snak("P19", "Q4002")), stmt(item_snak("P27", "Q4001")),
        stmt(item_snak("P54", "Q3001"), quals=[time_snak("P580", "+1979-06-01T00:00:00Z", 10), special_snak("P582", "novalue"),
                                                quantity_snak("P1350", "+120", "1"), quantity_snak("P1351", "+45", "1")]),
        stmt(item_snak("P54", "Q3002"), quals=[time_snak("P580", "+1985-00-00T00:00:00Z", 9), time_snak("P582", "+1990-00-00T00:00:00Z", 9)]),
        stmt(item_snak("P54", "Q3003"), quals=[special_snak("P580", "somevalue")]),
        stmt(item_snak("P413", "Q8001")),
        stmt(item_snak("P166", "Q5001"), quals=[time_snak("P585", "+1985-05-01T00:00:00Z", 11), item_snak("P805", "Q5002")]),
        stmt(item_snak("P1344", "Q2001")),
        stmt(item_snak("P1000", "Q6001")),
        stmt(string_snak("P18", "Alice Skater.jpg")),
        stmt(quantity_snak("P2048", "+183")),
        stmt(item_snak("P1532", "Q4001")),
        stmt(string_snak("P214", "12345")),
        # forbidden: sex, religion, ethnicity, spouse, child, party, cause of death, mother, given name
        stmt(item_snak("P21", "Q6581072")), stmt(item_snak("P140", "Q9268")), stmt(item_snak("P172", "Q49085")),
        stmt(item_snak("P26", "Q7000001")), stmt(item_snak("P40", "Q7000002")), stmt(item_snak("P102", "Q7000003")),
        stmt(item_snak("P509", "Q7000004")), stmt(item_snak("P25", "Q7000005")), stmt(item_snak("P735", "Q7000006")),
    ), {"enwiki": "Alice Skater", "frwiki": "Alice Patineuse", "dewiki": "Alice Eisläufer", "commonswiki": "Category:Alice Skater"}))
    # Q1002: tennis player (occupation) with no P641 -> only with --rule occupation
    e.append(entity("Q1002", {"en": "Bob Nosport"}, "Australian tennis player", claims(*human(), stmt(item_snak("P106", "Q10833314")))))
    # Q1003: has P641, occupation actor -> only with --rule sport
    e.append(entity("Q1003", {"en": "Carol Actor"}, "American actor", claims(*human(), stmt(item_snak("P106", "Q33999")), stmt(item_snak("P641", "Q847")))))
    # Q1004: only a sex-marking occupation + P641 -> not a strict match (the occupation is use=0)
    e.append(entity("Q1004", {"en": "Dana Marker"}, None, claims(*human(), stmt(item_snak("P106", "Q106037372")), stmt(item_snak("P641", "Q847")))))
    # Q1005: referee, preferred birth beats the normal one; Julian date; description with a sensitive word is dropped
    e.append(entity("Q1005", {"en": "Eve Referee"}, "Spanish referee and brother of Eve", claims(
        *human(), stmt(item_snak("P106", "Q202648")), stmt(item_snak("P641", "Q5372")),
        stmt(time_snak("P569", "+1899-12-31T00:00:00Z", 11)),
        stmt(time_snak("P569", "+1900-01-13T00:00:00Z", 11, "Q1985786"), rank="preferred"),
        stmt(time_snak("P569", "-0776-01-01T00:00:00Z", 9, "Q1985786"), rank="deprecated"))))
    # Q1006: ancient athlete, negative year, precision 9; coach occupation; bad time value (no precision) is skipped
    bad_time = time_snak("P570", "+1950-01-01T00:00:00Z", 11)
    del bad_time["datavalue"]["value"]["precision"]
    e.append(entity("Q1006", {"en": "Phidippides"}, "ancient runner", claims(
        *human(), stmt(item_snak("P106", "Q41583")), stmt(item_snak("P641", "Q847")),
        stmt(time_snak("P569", "-0490-00-00T00:00:00Z", 9, "Q1985786")), stmt(bad_time))))
    # Q1007: a player with a deprecated sport only: not matched strictly
    e.append(entity("Q1007", {"en": "Frank Deprecated"}, None, claims(*human(), stmt(item_snak("P106", "Q10871364")), stmt(item_snak("P641", "Q5372"), rank="deprecated"))))
    # events
    e.append(entity("Q2001", {"en": "2022 Tennis Final", "fr": "Finale 2022"}, "tennis match", claims(
        stmt(item_snak("P31", "Q1656682")), stmt(item_snak("P641", "Q847")),
        stmt(time_snak("P585", "+2022-07-10T00:00:00Z", 11)), stmt(item_snak("P1346", "Q1001")),
        stmt(item_snak("P710", "Q1001")), stmt(item_snak("P710", "Q1002")), stmt(item_snak("P276", "Q4002")), stmt(item_snak("P17", "Q4001")),
        stmt(item_snak("P361", "Q2100")), stmt(item_snak("P3450", "Q2101")),
        stmt(item_snak("P21", "Q6581072")))))  # a forbidden property on an event is dropped too
    e.append(entity("Q2002", {"en": "2021 Tennis Season"}, None, claims(
        stmt(item_snak("P31", "Q27020041")), stmt(item_snak("P641", "Q847")), stmt(time_snak("P580", "+2021-00-00T00:00:00Z", 9)),
        stmt(time_snak("P582", "+2021-12-31T00:00:00Z", 9)))))  # year precision, no winner -> an item
    e.append(entity("Q2003", {"en": "Hockey Cup 1999"}, None, claims(
        stmt(item_snak("P31", "Q15275719")), stmt(item_snak("P641", "Q41466")), stmt(item_snak("P1346", "Q3001")))))  # winner, no date -> event
    e.append(entity("Q2004", {"en": "Broken Date Match"}, None, claims(
        stmt(item_snak("P31", "Q1656682")), stmt(item_snak("P641", "Q847")),
        stmt(time_snak("P585", "+2020-00-00T00:00:00Z", 11)))))  # precision 11 but month 00: not a day -> an item
    e.append(entity("Q2005", {"en": "Ancient Games"}, None, claims(
        stmt(item_snak("P31", "Q1656682")), stmt(item_snak("P641", "Q847")), stmt(time_snak("P585", "-0776-07-01T00:00:00Z", 11, "Q1985786")))))  # BCE: not kept as an event
    e.append(entity("Q2006", {"en": "Finished Match"}, None, claims(
        stmt(item_snak("P31", "Q1656682")), stmt(item_snak("P641", "Q41466")), stmt(time_snak("P582", "+1999-03-04T00:00:00Z", 11)))))  # end at day precision
    # items (clubs, venues)
    e.append(entity("Q3001", {"en": "Quebec Skaters", "fr": "Patineurs de Québec"}, "ice hockey club", claims(
        stmt(item_snak("P31", "Q4498974")), stmt(item_snak("P641", "Q41466")), stmt(item_snak("P17", "Q4001")), stmt(item_snak("P118", "Q9001")),
        stmt(item_snak("P115", "Q9002")), stmt(time_snak("P571", "+1972-00-00T00:00:00Z", 9)), stmt(item_snak("P21", "Q6581072"))),
        {"enwiki": "Quebec Skaters"}))
    e.append(entity("Q3002", {"en": "Montreal Blades"}, None, claims(stmt(item_snak("P31", "Q4498974")), stmt(item_snak("P641", "Q41466")))))
    e.append(entity("Q3003", {"en": "Toronto Bats"}, None, claims(stmt(item_snak("P31", "Q4498974")), stmt(item_snak("P641", "Q5372")))))
    # not sport: a country and a city (labels pass), an item without P641
    e.append(entity("Q4001", {"en": "Canada", "fr": "Canada", "ja": "カナダ"}, "country", claims(
        stmt(item_snak("P31", "Q6256")), stmt(string_snak("P297", "CA")), stmt(string_snak("P298", "CAN")), stmt(string_snak("P300", "CA-QC")))))
    e.append(entity("Q4002", {"en": "Quebec City", "fr": "Québec"}, "city in Canada", claims(
        stmt(item_snak("P31", "Q515")), stmt(item_snak("P17", "Q4001")), stmt(item_snak("P131", "Q4003")))))
    e.append(entity("Q4003", {"en": "Quebec"}, "province", claims(stmt(item_snak("P31", "Q11828004")), stmt(item_snak("P17", "Q4001")))))
    e.append(entity("Q4004", {"en": "Unreferenced Town"}, None, claims(stmt(item_snak("P31", "Q515")))))
    # Q1009: P641 appears only as a qualifier of a team statement (it passes the byte test, not the rule)
    e.append(entity("Q1009", {"en": "Hank Qualifier"}, None, claims(
        *human(), stmt(item_snak("P106", "Q11774891")),
        stmt(item_snak("P54", "Q3001"), quals=[item_snak("P641", "Q41466")]))))
    # a human with the maximum of one thing: 1,005 awards (cap)
    many = [stmt(item_snak("P166", f"Q{8000000 + i}")) for i in range(1005)]
    e.append(entity("Q1008", {"en": "Grace Winner"}, None, claims(
        *human(), stmt(item_snak("P106", "Q10833314")), stmt(item_snak("P641", "Q847")), *many)))
    return e


def lines() -> list[bytes]:
    out = [b"["]
    ents = entities()
    raw = [json.dumps(x, ensure_ascii=False, separators=(",", ":")).encode("utf-8") for x in ents]
    # malformed lines: a cut-off entity that passes the byte test (counted as malformed), a stray text line, and a property entity
    raw.insert(3, raw[0][: len(raw[0]) // 2])                       # cut in half: contains "P641", is not JSON
    raw.insert(9, b"this is not json at all")                        # not an entity line
    raw.insert(12, json.dumps({"type": "property", "id": "P641", "labels": {"en": {"language": "en", "value": "sport"}}, "claims": {}}).encode())
    out.extend(r + b"," for r in raw[:-1])
    out.append(raw[-1])
    out.append(b"]")
    return out


def dump_bytes() -> bytes:
    return gzip.compress(b"\n".join(lines()) + b"\n", 9, mtime=0)


if __name__ == "__main__":
    OUT.write_bytes(dump_bytes())
    print(f"wrote {OUT.name}: {len(lines())} lines, {OUT.stat().st_size} bytes")
