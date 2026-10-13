"""Print the Wikidata venue ids the seeds name, one per line, for fetch.py.
Usage: ids.py > ids.txt           (run from the repo root; reads db/seed/home_venue.csv, game_venue_event.csv, retrosheet_park.csv,
venue_alias.csv, and venue_ids.txt, which lists every venue already in core.venue or core.brand_venue so that their opened and closed dates are fetched too)"""
import csv
ids = set()
for f in ("home_venue", "game_venue_event", "retrosheet_park", "venue_alias"):
    for r in csv.DictReader(open(f"db/seed/{f}.csv", newline="")):
        if (r.get("qid") or "").startswith("Q"):
            ids.add(r["qid"])
for line in open("db/seed/venue_ids.txt"):
    if line.strip().startswith("Q"):
        ids.add(line.split()[0])
print("\n".join(sorted(ids, key=lambda q: int(q[1:]))))
