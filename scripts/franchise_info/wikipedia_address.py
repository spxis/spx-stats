"""Street addresses from the English Wikipedia infobox (CC BY-SA 4.0) for the venues
of one league that Wikidata gives none. One request per 2.5 s, backing off on 429.
Usage: wikipedia_address.py <league> <raw dir> <YYYY-MM-DD>
Writes <raw dir>/<league>_wikipedia_infobox.json ({title: infobox wikitext or null}),
loads legacy_franchise_info.place_wikipedia, and leaves address normalisation to
address_normalise.py. Reads PGHOST/PGPORT/PGUSER/PGDATABASE through psql."""
import json, os, re, subprocess, sys, time, urllib.parse, urllib.request, urllib.error
league, raw, day = sys.argv[1:4]
UA = {"User-Agent": "spx-stats/0.1 (https://github.com/spxis/spx-stats)"}
def psql(sql):
    p = subprocess.run(["psql", "-v", "ON_ERROR_STOP=1", "-At", "-q", "-f", "-"], input=sql, text=True, capture_output=True)
    if p.returncode: raise SystemExit(p.stderr)
    return p.stdout
rows = json.loads(psql(f"""select coalesce(json_agg(json_build_object('qid', p.qid, 'title', p.enwiki)), '[]') from legacy_franchise_info.place p
 where p.enwiki is not null and p.address_raw is null
   and p.qid in (select tp.place_qid from legacy_franchise_info.team_place tp join legacy_franchise_info.team t using (qid)
                  where t.league_code = '{league}' and tp.kind = 'home_venue')"""))
out = f"{raw}/{league}_wikipedia_infobox.json"
have = json.load(open(out)) if os.path.exists(out) else {}
def fetch(title):
    url = "https://en.wikipedia.org/w/index.php?" + urllib.parse.urlencode({"title": title, "action": "raw"})
    for n in range(40):
        time.sleep(2.5)
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            if e.code not in (429, 503, 504): raise
            time.sleep(int(e.headers.get("Retry-After") or 20) + 10 + (n % 5) * 5)
        except Exception as e:
            print("ERR", e, file=sys.stderr); time.sleep(20)
    raise SystemExit("gave up " + title)
def infobox(text):
    if not text: return None
    m = re.search(r"\{\{\s*Infobox", text, re.I)
    if not m: return None
    depth, i = 0, m.start()
    while i < len(text) - 1:
        if text[i:i+2] == "{{": depth += 1; i += 2
        elif text[i:i+2] == "}}":
            depth -= 1; i += 2
            if depth == 0: return text[m.start():i]
        else: i += 1
    return None
for r in rows:
    if r["title"] not in have:
        have[r["title"]] = infobox(fetch(r["title"]))
        json.dump(have, open(out, "w"), separators=(",", ":"), ensure_ascii=False, sort_keys=True)
def clean(v):
    v = re.sub(r"<!--.*?-->", "", v, flags=re.S)
    v = re.sub(r"<ref[^>]*?/>|<ref[^>]*>.*?</ref>", "", v, flags=re.S)
    v = re.sub(r"<br\s*/?>", ", ", v, flags=re.I)
    v = re.sub(r"\{\{\s*(?:nowrap|nobr)\s*\|([^{}]*)\}\}", r"\1", v, flags=re.I)
    v = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", v)
    v = re.sub(r"\{\{[^{}]*\}\}", "", v)
    v = re.sub(r"'{2,}", "", v)
    return re.sub(r"\s+", " ", v).strip(" ,;")
def q(v): return "null" if v is None else "'" + str(v).replace("'", "''") + "'"
sql = ["begin;"]
for r in rows:
    ib = have.get(r["title"])
    adr = None
    if ib:
        m = re.search(r"^\s*\|\s*address\s*=\s*(.*?)(?=^\s*\|\s*[\w ]+=|\Z)", ib[:-2], re.S | re.M)
        if m: adr = clean(m.group(1)) or None
    sql.append(f"insert into legacy_franchise_info.place_wikipedia values ({q(r['qid'])},{q(r['title'])},{q(adr)},{q(day)}) on conflict (qid) do update set title=excluded.title, address_raw=excluded.address_raw, fetched_on=excluded.fetched_on;")
sql.append("commit;")
psql("\n".join(sql))
print(league, len(rows), "venues without an address;", sum(1 for r in rows if have.get(r["title"])), "infoboxes")
