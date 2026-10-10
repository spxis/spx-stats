"""Load one league's raw franchise answers (see fetch.py) into
legacy_franchise_info. Usage: load.py <league> <raw dir> <YYYY-MM-DD>
Reads the database named by PGHOST/PGPORT/PGUSER/PGDATABASE through psql.
Rerunnable: the league's own rows are deleted first; places are upserted
(a place can serve two leagues). Address columns are filled by
address_normalise.mjs afterwards."""
import json, re, subprocess, sys
league, raw, day = sys.argv[1:4]
teams = json.load(open(f"{raw}/{league}_teams.json"))
tents = json.load(open(f"{raw}/{league}_team_entities.json"))
places = json.load(open(f"{raw}/{league}_places.json"))
labels = json.load(open(f"{raw}/{league}_labels.json"))

def q(v):
    if v is None: return "null"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''") + "'"
def arr(v): return "null" if not v else "array[" + ",".join(q(x) for x in v) + "]::text[]"

def dt(v):
    """A Wikidata time value -> (iso date, precision) or (None, None). Month 00 and day 00 become 01; below year precision is dropped."""
    if not isinstance(v, dict) or "t" not in v: return None, None
    m = re.match(r"^\+?(\d{4})-(\d\d)-(\d\d)T", v["t"])
    if not m or v["p"] < 9 or int(m[1]) < 1700: return None, None
    y, mo, d = m[1], m[2], m[3]
    return f"{y}-{mo if mo != '00' else '01'}-{d if d != '00' else '01'}", v["p"]
def best(rows, p, fn=min):
    """Preferred-rank values first, else normal; deprecated dropped."""
    rs = [r for r in rows.get(p, []) if r["r"] != "d"]
    pref = [r for r in rs if r["r"] == "p"] or rs
    ds = [dt(r["v"]) for r in pref]
    ds = [x for x in ds if x[0]]
    return fn(ds) if ds else (None, None)
def qd(r, p):
    xs = r.get("q", {}).get(p)
    return dt(xs[0]) if xs else (None, None)
RANK = {"p": "preferred", "n": "normal"}

sql = ["begin;"]
sql.append(f"""delete from legacy_franchise_info.team_name where qid in (select qid from legacy_franchise_info.team where league_code = {q(league)});
delete from legacy_franchise_info.team_place where qid in (select qid from legacy_franchise_info.team where league_code = {q(league)});
delete from legacy_franchise_info.team_owner where qid in (select qid from legacy_franchise_info.team where league_code = {q(league)});
delete from legacy_franchise_info.team where league_code = {q(league)};""")

sparql = {}
for r in teams:
    sparql[r["team"].rsplit("/", 1)[1]] = r
for qid, e in sorted(tents.items()):
    if e.get("missing"): continue
    c = e.get("claims", {})
    inc, incp = best(c, "P571", min)
    dis, disp = best(c, "P576", max)
    sql.append(f"insert into legacy_franchise_info.team values ({q(league)},{q(qid)},{q(e['label'])},{q(inc)},{q(incp)},{q(dis)},{q(disp)},{q(e.get('enwiki'))},{q(e.get('desc'))},{q(day)});")
    for r in c.get("P1448", []):
        if r["r"] == "d" or not isinstance(r["v"], dict): continue
        s, _ = qd(r, "P580"); en, _ = qd(r, "P582")
        sql.append(f"insert into legacy_franchise_info.team_name values ({q(qid)},{q(r['v']['x'])},'official',{q(s)},{q(en)}) on conflict do nothing;")
    for a in e.get("aliases", []):
        sql.append(f"insert into legacy_franchise_info.team_name values ({q(qid)},{q(a)},'alias',null,null) on conflict do nothing;")
    for prop, kind in (("P115", "home_venue"), ("P159", "headquarters"), ("P131", "located_in")):
        for r in c.get(prop, []):
            if r["r"] == "d" or not isinstance(r["v"], str): continue
            s, sp = qd(r, "P580"); en, ep = qd(r, "P582")
            sql.append(f"insert into legacy_franchise_info.team_place values ({q(qid)},{q(kind)},{q(r['v'])},{q(s)},{q(sp)},{q(en)},{q(ep)},{q(RANK[r['r']])}) on conflict do nothing;")
    for r in c.get("P127", []):
        if r["r"] == "d" or not isinstance(r["v"], str): continue
        s, sp = qd(r, "P580"); en, ep = qd(r, "P582")
        share = None
        for x in r.get("q", {}).get("P1107", []):
            if isinstance(x, dict) and "a" in x:
                try: share = float(x["a"])
                except ValueError: pass
        nm = places.get(r["v"], {}).get("label")
        sql.append(f"insert into legacy_franchise_info.team_owner values ({q(qid)},{q(r['v'])},{q(nm)},{q(s)},{q(sp)},{q(en)},{q(ep)},{q(share)},{q(RANK[r['r']])}) on conflict do nothing;")

def lab(i): return (places.get(i) or labels.get(i) or {}).get("label")
def types_of(e): return [lab(r["v"]) for r in e.get("claims", {}).get("P31", []) if isinstance(r["v"], str) and lab(r["v"])]
def first_id(e, p):
    rs = [r for r in e.get("claims", {}).get(p, []) if r["r"] != "d" and isinstance(r["v"], str)]
    # a place that is still current: no end date, preferred rank first
    rs.sort(key=lambda r: (r["r"] != "p", bool(r.get("q", {}).get("P582"))))
    return rs[0]["v"] if rs else None
def iana_of(e):
    """The IANA names of a place's time zones (P421 items that carry P6687), without the old US/ and Canada/ aliases."""
    out = []
    for r in e.get("claims", {}).get("P421", []):
        if r["r"] != "d" and isinstance(r["v"], str):
            for z in (labels.get(r["v"]) or {}).get("claims", {}).get("P6687", []):
                n = z["v"]
                if isinstance(n, str) and not n.startswith(("US/", "Canada/")) and n not in out: out.append(n)
    return out
def one_zone(names): return names[0] if len(names) == 1 else None
def parents(e):
    """Every non-deprecated P131 target, current ones first."""
    rs = [r for r in e.get("claims", {}).get("P131", []) if r["r"] != "d" and isinstance(r["v"], str)]
    rs.sort(key=lambda r: (r["r"] != "p", bool(r.get("q", {}).get("P582"))))
    return [r["v"] for r in rs]
def chain_of(e):
    """The places above a venue, breadth first over every P131 (a venue can sit in a neighbourhood and a city at once), with each one's depth."""
    out, seen, level = [], set(), parents(e)
    for depth in range(1, 7):
        nxt = []
        for cur in level:
            if cur in seen: continue
            seen.add(cur); pe = places.get(cur) or {}
            cl = pe.get("claims", {})
            iso2 = next((r["v"] for r in cl.get("P300", []) if isinstance(r["v"], str)), None)
            isoa = next((r["v"] for r in cl.get("P297", []) if isinstance(r["v"], str)), None)
            out.append({"qid": cur, "label": pe.get("label"), "types": types_of(pe), "iso_3166_2": iso2, "iso_alpha2": isoa,
                        "tz": iana_of(pe), "depth": depth})
            if not isoa: nxt += parents(pe)
        level = nxt
        if not level: break
    return out
def quantity(rows):
    rs = [r for r in rows if r["r"] != "d" and isinstance(r["v"], dict) and "a" in r["v"]]
    rs.sort(key=lambda r: (r["r"] != "p", -(qd(r, "P585")[0] or "0000").__hash__() if False else 0))
    # the latest by point in time, else the first listed
    rs.sort(key=lambda r: (r["r"] != "p",))
    dated = [r for r in rs if r.get("q", {}).get("P585")]
    if dated: return sorted(dated, key=lambda r: dt(r["q"]["P585"][0])[0] or "")[-1]["v"]
    return rs[0]["v"] if rs else None

for qid, e in sorted(places.items()):
    cl = e.get("claims")
    if cl is None or e.get("missing"): continue
    co = next((r["v"] for r in cl.get("P625", []) if r["r"] != "d" and isinstance(r["v"], dict)), None)
    cap = quantity(cl.get("P1083", []))
    cap = int(float(cap["a"])) if cap and float(cap["a"]) > 0 else None
    op, opp = best(cl, "P1619", min)
    if not op: op, opp = best(cl, "P571", min)
    cl_, clp = best(cl, "P3999", max)
    if not cl_: cl_, clp = best(cl, "P576", max)
    adr = next((r["v"] for r in cl.get("P6375", []) if r["r"] != "d" and isinstance(r["v"], dict)), None)
    post = next((r["v"] for r in cl.get("P281", []) if r["r"] != "d" and isinstance(r["v"], str)), None)
    tzq = first_id(e, "P421")
    tzl = lab(tzq) if tzq else None
    chain = chain_of(e)
    # the venue's own zone, else the nearest place above it (not the country) that names exactly one
    tz = one_zone(iana_of(e)) or next((one_zone(c["tz"]) for c in chain if not c["iso_alpha2"] and one_zone(c["tz"])), None)
    surf = sorted({lab(r["v"]) for r in cl.get("P765", []) if r["r"] != "d" and isinstance(r["v"], str) and lab(r["v"])})
    ty = types_of(e)
    tl = " ".join(ty).lower()
    roof = "retractable" if "retractable" in tl else "dome" if "domed" in tl or " dome" in " " + tl else None
    arch = ", ".join(sorted({lab(r["v"]) for r in cl.get("P84", []) if isinstance(r["v"], str) and lab(r["v"])})) or None
    cost = quantity(cl.get("P2130", []))
    ctry = first_id(e, "P17")
    iso2 = next((r["v"] for r in cl.get("P300", []) if isinstance(r["v"], str)), None)
    isoa = next((r["v"] for r in cl.get("P297", []) if isinstance(r["v"], str)), None)
    if not ctry and chain: ctry = None
    sql.append(f"""insert into legacy_franchise_info.place (qid,label,description,instance_of,latitude,longitude,address_raw,postal_raw,capacity,opened_on,opened_prec,closed_on,closed_prec,time_zone,time_zone_label,surface,roof,architect,cost,cost_unit,located_in,country_qid,iso_3166_2,iso_alpha2,chain,enwiki,fetched_on)
 values ({q(qid)},{q(e['label'])},{q(e.get('desc'))},{arr(ty)},{q(round(co['lat'], 6) if co else None)},{q(round(co['lon'], 6) if co else None)},{q(adr['x'] if adr else None)},{q(post)},{q(cap)},{q(op)},{q(opp)},{q(cl_)},{q(clp)},{q(tz)},{q(tzl)},{q('; '.join(surf) or None)},{q(roof)},{q(arch)},{q(cost['a'] if cost else None)},{q(cost['u'] if cost else None)},{q(first_id(e, 'P131'))},{q(ctry)},{q(iso2)},{q(isoa)},{q(json.dumps(chain, ensure_ascii=False))}::jsonb,{q(e.get('enwiki'))},{q(day)})
 on conflict (qid) do update set label=excluded.label, description=excluded.description, instance_of=excluded.instance_of, latitude=excluded.latitude, longitude=excluded.longitude, address_raw=excluded.address_raw, postal_raw=excluded.postal_raw, capacity=excluded.capacity, opened_on=excluded.opened_on, opened_prec=excluded.opened_prec, closed_on=excluded.closed_on, closed_prec=excluded.closed_prec, time_zone=excluded.time_zone, time_zone_label=excluded.time_zone_label, surface=excluded.surface, roof=excluded.roof, architect=excluded.architect, cost=excluded.cost, cost_unit=excluded.cost_unit, located_in=excluded.located_in, country_qid=excluded.country_qid, iso_3166_2=excluded.iso_3166_2, iso_alpha2=excluded.iso_alpha2, chain=excluded.chain, enwiki=excluded.enwiki, fetched_on=excluded.fetched_on;""")
    sql.append(f"delete from legacy_franchise_info.place_name where qid = {q(qid)};")
    for prop, kind in (("P1448", "official"), ("P2561", "name")):
        for r in cl.get(prop, []):
            if r["r"] == "d" or not isinstance(r["v"], dict) or "x" not in r["v"]: continue
            s, sp = qd(r, "P580"); en, ep = qd(r, "P582")
            sql.append(f"insert into legacy_franchise_info.place_name values ({q(qid)},{q(r['v']['x'])},{q(kind)},{q(s)},{q(sp)},{q(en)},{q(ep)}) on conflict do nothing;")
    for a in e.get("aliases", []):
        sql.append(f"insert into legacy_franchise_info.place_name values ({q(qid)},{q(a)},'alias',null,null,null,null) on conflict do nothing;")
sql.append("commit;")
p = subprocess.run(["psql", "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"], input="\n".join(sql), text=True, capture_output=True)
print(p.stdout[-500:], p.stderr[-2000:])
if p.returncode: raise SystemExit(1)
print("loaded", league, len(tents), "teams", len(places), "places")
