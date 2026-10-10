#!/usr/bin/env python3
"""Parse Wikipedia's team colour Lua data modules (CC BY-SA 4.0) into
legacy_team_brand.wikipedia_colour. Usage: load_wikipedia_colours.py <raw dir> | psql ...
Output is tab-separated for psql \\copy ... with (format csv, delimiter E'\\t', null '\\N').
Modules (saved as fetched, action=raw):
  ice_hockey.lua     Module:Sports color/ice hockey   {bg1, text1, bg2, text2}
  basketball.lua     Module:Sports color/basketball   same
  baseball.lua       Module:Sports color/baseball     same
  gridiron_data.lua  Module:Gridiron color/data       {c1, c2, c3, alt1, alt2}
"""
import re, sys, os, csv, io

RAW = sys.argv[1]
NAMED = {'red': 'FF0000', 'gold': 'FFD700', 'silver': 'C0C0C0', 'blue': '0000FF', 'maroon': '800000',
         'black': '000000', 'white': 'FFFFFF'}

def hexn(s):
    s = (s or '').strip().lstrip('#').upper()
    if s.lower() in NAMED: return NAMED[s.lower()]
    if re.fullmatch(r'[0-9A-F]{3}', s): s = ''.join(c * 2 for c in s)
    return s if re.fullmatch(r'[0-9A-F]{6}', s) else None

# module file, page, scheme, {section comment -> league}
MODS = [
 ('ice_hockey.lua', 'Module:Sports color/ice hockey', 'sports', {'Current NHL': 'nhl', 'Former NHL': 'nhl'}),
 ('basketball.lua', 'Module:Sports color/basketball', 'sports', {'NBA': 'nba', 'Defunct NBA': 'nba'}),
 ('baseball.lua', 'Module:Sports color/baseball', 'sports', {'Major League Baseball': 'mlb'}),
 ('gridiron_data.lua', 'Module:Gridiron color/data', 'gridiron',
  {'NFL/AFL teams': 'nfl', 'Defunct NFL teams': 'nfl', 'CFL teams': 'cfl', 'Defunct CFL teams': 'cfl'}),
]
# entries whose key carries years or a qualifier in another way
OVERRIDE = {  # key -> (team_name, start_year, end_year)
 'Ottawa Senators (original)': ('Ottawa Senators', 1883, 1934),
 'Winnipeg Jets (1972–1996)': ('Winnipeg Jets', 1972, 1996),
}
ENTRY = re.compile(r'''^(\s*)\[\s*(["'])(.+?)\2\s*\]\s*=\s*(.*)$''')
out = csv.writer(sys.stdout, delimiter='\t', lineterminator='\n')
rows = []
for fn, page, scheme, secs in MODS:
    league = None
    with open(os.path.join(RAW, fn), encoding='utf-8') as f:
        lines = f.read().splitlines()
    if scheme == 'sports':
        for ln in lines:
            m = re.match(r'^\s*--\s*(.+?)\s*--\s*$', ln)
            if m and not ln.lstrip().startswith('-- START'):
                league = secs.get(m.group(1).strip())
                continue
            if m: continue
            if league: pass
            else: continue
            e = ENTRY.match(ln)
            if e: rows.append((league, page, scheme, e))
    else:
        for ln in lines:
            m = re.match(r'^-- START (.+?)(?: teams)? --\s*$', ln)
            if m:
                league = secs.get(m.group(1) + ' teams') or secs.get(m.group(1)); continue
            if ln.startswith('-- END'): league = None; continue
            if not league: continue
            e = ENTRY.match(ln)
            if e: rows.append((league, page, scheme, e))

recs = []
for seq, (league, page, scheme, e) in enumerate(rows, 1):
    indent, _, key, rest = e.groups()
    rest = rest.strip()
    alias = None; slots = []
    if rest[:1] in ('"', "'"):
        alias = re.match(r"""["'](.*?)["']""", rest).group(1)
    else:
        body = rest[1:].split('{')[0]          # colours before any nested historical table
        slots = re.findall(r"""["']([^"']*)["']""", body.split('}')[0])
    name, sy, ey = key, None, None
    m = re.match(r'^(.*?)\s+(\d{4})thru(\d{4})$', key)
    if m: name, sy, ey = m.group(1), int(m.group(2)), int(m.group(3))
    if key in OVERRIDE: name, sy, ey = OVERRIDE[key]
    recs.append(dict(league=league, page=page, scheme=scheme, key=key, seq=seq, name=name, sy=sy, ey=ey,
                     indent=bool(indent), alias=alias, slots=slots))
by_key = {}
for r in recs:
    by_key.setdefault((r['page'], r['league'], r['key']), r)
    by_key.setdefault((r['page'], None, r['key']), r)
def resolve(r):
    seen = set()
    while r['alias'] and r['key'] not in seen:
        seen.add(r['key'])
        nxt = by_key.get((r['page'], r['league'], r['alias'])) or by_key.get((r['page'], None, r['alias']))
        if not nxt: return None
        r = nxt
    return r
for r in recs:
    t = resolve(r)
    s = [hexn(x) for x in (t['slots'] if t else [])] + [None] * 5
    if r['scheme'] == 'sports':
        prim, sec = s[0], s[2]
    else:
        prim = s[0]
        sec = s[2] or (s[1] if s[1] != 'FFFFFF' else None)
    N = lambda x: x if x not in (None, '') else '\\N'
    out.writerow([r['league'], r['page'], r['key'], r['seq'], r['name'], N(r['sy']), N(r['ey']),
                  't' if r['indent'] else 'f', N(r['alias']), N(t['key'] if t else None), N(t['name'] if t else None),
                  N(prim), N(sec), *[N(x) for x in s[:5]],
                  '{' + ','.join('"%s"' % x.replace('"', '') for x in (t['slots'] if t else [])) + '}'])
