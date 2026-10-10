"""Run a SPARQL query on query.wikidata.org and save the JSON answer.
Usage: sparql.py <query.rq> <out.json>. Wikidata is CC0."""
import json, sys, time, urllib.parse, urllib.request
q = open(sys.argv[1]).read()
for attempt in range(5):
    req = urllib.request.Request("https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q, "format": "json"}),
                                 headers={"User-Agent": "spx-stats/0.1 (https://github.com/spxis/spx-stats)", "Accept": "application/sparql-results+json"})
    try:
        data = json.loads(urllib.request.urlopen(req, timeout=120).read())
        break
    except Exception as e:
        print("retry:", e, file=sys.stderr); time.sleep(65)
else:
    raise SystemExit("Wikidata did not answer")
rows = [{k: v["value"] for k, v in b.items()} for b in data["results"]["bindings"]]
json.dump(rows, open(sys.argv[2], "w"), indent=1)
print(len(rows), "rows")
