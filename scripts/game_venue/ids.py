"""Print the Wikidata venue ids the seeds name, one per line, for fetch.py.
Usage: ids.py > ids.txt           (run from the repo root; reads db/seed/home_venue.csv, game_venue_event.csv, retrosheet_park.csv, venue_alias.csv)"""
import csv
ids = set()
for f in ("home_venue", "game_venue_event", "retrosheet_park", "venue_alias"):
    for r in csv.DictReader(open(f"db/seed/{f}.csv", newline="")):
        if (r.get("qid") or "").startswith("Q"):
            ids.add(r["qid"])
print("\n".join(sorted(ids, key=lambda q: int(q[1:]))))
