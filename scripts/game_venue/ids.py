"""Print the Wikidata venue ids the seeds name, one per line, for fetch.py.
Usage: ids.py > ids.txt           (run from the repo root; reads db/seed/home_venue.csv, game_venue_event.csv, retrosheet_park.csv,
venue_alias.csv, venue_ids.txt, which lists every venue already in core.venue or core.brand_venue so that their opened and closed dates are fetched too,
and soccer_venue_ids.csv, the stadiums of the World Cup and MLS matches and kyogijo's grounds: scripts/world_stadiums/README.md)
       ids.py --new RAW_DIR [RAW_DIR ...] > ids.txt     only the ids no RAW_DIR (an earlier fetch.py output) holds an item for, so a later fetch asks Wikidata only for those"""
import csv, glob, json, sys
ids = set()
for f in ("home_venue", "game_venue_event", "retrosheet_park", "venue_alias"):
    for r in csv.DictReader(open(f"db/seed/{f}.csv", newline="")):
        if (r.get("qid") or "").startswith("Q"):
            ids.add(r["qid"])
for line in open("db/seed/venue_ids.txt"):
    if line.strip().startswith("Q"):
        ids.add(line.split()[0])
for r in csv.DictReader(open("db/seed/soccer_venue_ids.csv", newline="", encoding="utf-8")):
    ids.add(r["qid"])
if len(sys.argv) > 2 and sys.argv[1] == "--new":
    have = set()
    for raw in sys.argv[2:]:
        for p in glob.glob(f"{raw}/wikidata/venues-*.json"):
            have |= set(json.load(open(p))["entities"])
    ids -= have
print("\n".join(sorted(ids, key=lambda q: int(q[1:]))))
