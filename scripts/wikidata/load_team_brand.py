"""Load one league's raw team-brand answers (see team_brand.py) into
legacy_team_brand. Usage: load_team_brand.py <league> <raw dir> <YYYY-MM-DD>
Reads the database named by PGHOST/PGPORT/PGUSER/PGDATABASE through psql."""
import json, subprocess, sys
league, raw, day = sys.argv[1:4]
teams = json.load(open(f"{raw}/{league}_teams.json"))
ents = json.load(open(f"{raw}/{league}_entities.json"))
cols = json.load(open(f"{raw}/{league}_colours.json"))
com = json.load(open(f"{raw}/{league}_commons.json"))
ven = json.load(open(f"{raw}/{league}_venues.json"))
places = json.load(open(f"{raw}/{league}_places.json"))
def d(s):
    if not s: return None
    s = s.lstrip("+")[:10]
    return s if s[:4].isdigit() and not s.endswith("-00") and s[5:7] != "00" else (s[:4] + "-01-01" if s[:4].isdigit() else None)
def q(v): return "null" if v is None else "'" + str(v).replace("'", "''") + "'"
dates = {}
for r in teams:
    k = r["team"].rsplit("/", 1)[1]
    a = dates.setdefault(k, {"inc": None, "dis": None})
    if r.get("inception"): a["inc"] = min(filter(None, [a["inc"], d(r["inception"])]))
    if r.get("dissolved"): a["dis"] = max(filter(None, [a["dis"], d(r["dissolved"])]))
sql = ["begin;"]
sql.append(f"delete from legacy_team_brand.team_colour where qid in (select qid from legacy_team_brand.team where league_code = {q(league)});")
sql.append(f"delete from legacy_team_brand.team_logo where qid in (select qid from legacy_team_brand.team where league_code = {q(league)});")
sql.append(f"delete from legacy_team_brand.team_place where qid in (select qid from legacy_team_brand.team where league_code = {q(league)});")
sql.append(f"delete from legacy_team_brand.team where league_code = {q(league)};")
for qid, e in sorted(ents.items()):
    dt = dates.get(qid, {})
    sql.append(f"insert into legacy_team_brand.team values ({q(league)},{q(qid)},{q(e['label'])},{q(dt.get('inc'))},{q(dt.get('dis'))},{q(day)});")
    for i, c in enumerate(e["colours"]):
        hx = (cols.get(c["id"], {}).get("hex") or [None])[0]
        hx = hx.upper().lstrip("#") if hx else None
        try: o = int(float(c["ordinal"])) if c["ordinal"] else i + 1
        except ValueError: o = i + 1
        sql.append(f"insert into legacy_team_brand.team_colour values ({q(qid)},{o},{q(c['id'])},{q(cols.get(c['id'], {}).get('label'))},{q(hx)},{q(c['rank'])}) on conflict do nothing;")
    for l in e["logos"]:
        m = com.get(l["file"].replace(" ", "_")) or com.get(l["file"]) or {}
        if not m or m.get("missing"): m = {}
        sql.append(f"insert into legacy_team_brand.team_logo values ({q(qid)},{q(l['file'])},{q(d(l['start']))},{q(d(l['end']))},{q(l['rank'])},{q(m.get('thumb'))},{q(m.get('url'))},{q(m.get('page'))},{q(m.get('licence'))},{q(m.get('licence_code'))},{q(m.get('restrictions'))}) on conflict do nothing;")
for qid, v in sorted(ven.items()):
    for kind, key in (("home_venue", "home"), ("headquarters", "hq"), ("located_in", "located_in")):
        for x in v[key]:
            p = places.get(x["id"], {})
            lat = round(p["lat"], 5) if p.get("lat") is not None else None
            lon = round(p["lon"], 5) if p.get("lon") is not None else None
            sql.append(f"insert into legacy_team_brand.team_place values ({q(qid)},{q(kind)},{q(x['id'])},{q(p.get('label'))},{q(lat)},{q(lon)},{q(d(x['start']))},{q(d(x['end']))},{q(x['rank'])}) on conflict do nothing;")
sql.append("commit;")
subprocess.run(["psql", "-h", "/tmp", "-p", "55432", "-U", "postgres", "-d", "spx_stats", "-v", "ON_ERROR_STOP=1", "-q"], input="\n".join(sql), text=True, check=True)
print(league, len(ents), "teams loaded")
