"""Fill legacy_franchise_info.place.address_* for every venue a team calls home
(and any place that has a street address): the raw address and the location
hints go to address_normalise.mjs, which uses @johnmorrisdotca/address-plus.
Usage: address_normalise.py <work dir>   (a scratch folder; npm installs the pinned package there)
Reads PGHOST/PGPORT/PGUSER/PGDATABASE through psql."""
import json, subprocess, sys, os
work = sys.argv[1]
def psql(sql):
    p = subprocess.run(["psql", "-v", "ON_ERROR_STOP=1", "-At", "-q", "-f", "-"], input=sql, text=True, capture_output=True)
    if p.returncode: raise SystemExit(p.stderr)
    return p.stdout
SQL = r"""
select coalesce(json_agg(json_build_object('qid', p.qid, 'label', p.label, 'raw', coalesce(p.address_raw, w.address_raw), 'postal', p.postal_raw, 'chain', p.chain, 'cq', p.country_qid, 'ca', c.iso_alpha2)), '[]')
from legacy_franchise_info.place p
left join legacy_franchise_info.place c on c.qid = p.country_qid
left join legacy_franchise_info.place_wikipedia w on w.qid = p.qid
where p.qid in (select place_qid from legacy_franchise_info.team_place) and p.chain is not null
"""
rows = json.loads(psql(SQL))
import re
STRONG = re.compile(r"^(?:[\w-]+ ){0,2}(city|town|village|hamlet|borough|municipality|township|commune)\b", re.I)
def hints(r):
    chain = r["chain"] or []
    reg = next((c["iso_3166_2"] for c in chain if c.get("iso_3166_2") and c["iso_3166_2"][:3] in ("US-", "CA-")), None)
    state_depth = min([c["depth"] for c in chain if c.get("iso_3166_2")] or [99])
    def cityish(c): return any(STRONG.search(t) and not re.search(r"county|parish|region", t, re.I) for t in c.get("types") or [])
    below = [c for c in chain if not c.get("iso_3166_2") and not c.get("iso_alpha2") and c["depth"] <= state_depth]
    cities = sorted((c for c in below if cityish(c)), key=lambda c: c["depth"])      # outermost city wins: a borough sits inside its city
    cty = cities[-1]["label"] if cities else None
    if not cty and below: cty = min(below, key=lambda c: c["depth"])["label"]   # no city in the chain: the nearest place Wikidata names (a county, a neighbourhood)
    country = r.get("ca") or next((c["iso_alpha2"] for c in chain if c.get("iso_alpha2")), None) or (reg[:2] if reg else None)
    return {"qid": r["qid"], "label": r["label"], "raw": r["raw"], "postal": r["postal"], "city": cty, "region": reg, "country": country}
inp = [hints(r) for r in rows]
os.makedirs(work, exist_ok=True)
json.dump(inp, open(f"{work}/addr_in.json", "w"))
here = os.path.dirname(os.path.abspath(__file__))
subprocess.run(["cp", f"{here}/address_normalise.mjs", f"{here}/package.json", work], check=True)   # ESM resolves the package from beside the script
if not os.path.isdir(f"{work}/node_modules/@johnmorrisdotca/address-plus"):
    subprocess.run(["npm", "install", "--no-audit", "--no-fund", "--ignore-scripts"], check=True, cwd=work)
subprocess.run(["node", "address_normalise.mjs", "addr_in.json", "addr_out.json"], check=True, cwd=work)
out = json.load(open(f"{work}/addr_out.json"))
def q(v): return "null" if v is None else "'" + str(v).replace("'", "''") + "'"
sql = ["begin;"]
for o in out:
    sql.append(f"update legacy_franchise_info.place set address_street={q(o['street'])}, address_city={q(o['city'])}, address_region={q(o['region'])}, address_postal={q(o['postal'])}, address_country={q(o['country'])}, address_parsed={q(o['parsed'])} where qid={q(o['qid'])};")
sql.append("delete from legacy_franchise_info.city_region;")
for o in out:
    if o["city"] and o["region"] and o["country"]:
        sql.append(f"insert into legacy_franchise_info.city_region values ({q(o['city'])},{q(o['region'])},{q(o['country'])},{q(o['qid'])}) on conflict do nothing;")
sql.append("commit;")
psql("\n".join(sql))
print("updated", len(out))
