#!/usr/bin/env python3
"""Turn each cached award article into an archive file (the winners table as read) and the winner rows worked out from it.

Usage: extract.py [--cache DIR] [--out DIR] [code ...]
Writes <out>/<award_code>.json: the source article, licence and the tables or list lines read (the archive; `columns`
says which cell positions of a wide table were kept), and <out>/../../parsed/<date>/<award_code>.json for load.py:
one row per winner with the fields named in `parsed_columns` (i, t, r, season, year_text, winner, team, position, group).
`season` is the season's start year (NHL and NBA seasons span two years; the others are named by the year played)."""
import argparse, datetime, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from titles import TITLES
from wikitable import tables, clean

FETCHED = "2026-10-10"
PCOLS = ["i", "t", "r", "season", "year_text", "winner", "team", "position", "group"]
SKIP = re.compile(r"not (awarded|played|held|presented)|cancel|no award|no winner|suspended|lockout|^[—–-]*$|^n/?a$|^tba$|^tbd$|^\(?(vacant|none)\)?$", re.I)

def name(s):
    s = s.replace("‖", " ")
    s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"[*†‡^~#§+]+", " ", s)
    s = re.sub(r"-playing\b", "", s)
    return re.sub(r"\s+", " ", s).strip(" ,;")

def names(s):
    """One cell may hold several people ("A & B"); a role prefix ("Offence: ") goes to the position."""
    role = None
    m = re.match(r"^(Offen[cs]e|Defen[cs]e|Special teams)\s*:\s*(.*)$", s.strip(), re.I)
    if m: role, s = m.group(1).title(), m.group(2)
    return [(name(x), role) for x in re.split(r"\s*(?:&|‖)\s*", s) if name(x)]

def start_year(txt, mode):
    m = re.search(r"(\d{4})\s*[–-]\s*\d{2,4}", txt)
    if m: return int(m.group(1))
    m = re.search(r"(?<!\d)(\d{4})(?!\d)", txt)
    if not m: return None
    y = int(m.group(1))
    return y - 1 if mode == "end" else y

def sb_season(txt):
    m = re.search(r"\((\d{4})", txt)
    return int(m.group(1)) if m else None

# (table index, columns) - year, winner, team, pos are cell indexes; group is a fixed label; mode: start | end
# league-split tables list one entry per league.
def T(ix, y, w, t=None, pos=None, group=None, mode="start", **kw): return dict(ix=ix, y=y, w=w, t=t, pos=pos, group=group, mode=mode, **kw)
AL, NL = "American League", "National League"
SPEC = {
 "nhl_stanley_cup": [T(0, 0, 1, mode="end", team_award=1), T(1, 0, 1, mode="end", team_award=1), T(2, 0, 1, mode="end", team_award=1)],
 "nhl_presidents_trophy": [T(1, 0, 1, team_award=1)],
 "nhl_art_ross": [T(0, 0, 1, 2)], "nhl_hart": [T(1, 0, 1, 3, 2)], "nhl_rocket_richard": [T(0, 0, 1, 2)],
 "nhl_ted_lindsay": [T(1, 0, 1, 2, 3)], "nhl_norris": [T(0, 0, 1, 2)], "nhl_calder": [T(1, 0, 1, 2, 3)],
 "nhl_conn_smythe": [T(1, 0, 1, 2, 3, mode="end")], "nhl_vezina": [T(0, 0, 1, 2), T(1, 0, 1, 2)],
 "nhl_selke": [T(1, 0, 1, 2, 3)], "nhl_lady_byng": [T(1, 0, 1, 2, 3)], "nhl_king_clancy": [T(1, 0, 1, 2)],
 "nhl_masterton": [T(0, 0, 1, 2)], "nhl_jennings": [T(0, 0, 1, 2)], "nhl_jack_adams": [T(0, 0, 1, 2)],
 "nhl_gm_of_the_year": [T(0, 0, 1, 2)],
 "nba_larry_obrien": [dict(ix=1, kind="nba_final", mode="end", team_award=1)],
 "nba_mvp": [T(1, 0, 1, 4, 2)], "nba_finals_mvp": [T(1, 0, 1, 4, 2, mode="end")],
 "nba_rookie_of_the_year": [T(1, 0, 1, 4, 2)], "nba_defensive_player": [T(1, 0, 1, 4, 2)],
 "nba_sixth_man": [T(1, 0, 1, 4, 2)], "nba_most_improved": [T(1, 0, 1, 4, 2)], "nba_coach_of_the_year": [T(1, 0, 1, 3)],
 "mlb_world_series": [T(0, 0, 1, team_award=1)],
 "mlb_mvp": [dict(ix=2, kind="mlb_mvp"), dict(ix=3, kind="mlb_mvp")],
 "mlb_cy_young": [T(1, 0, 1, 2), T(2, 0, 1, 2, group=AL), T(3, 0, 1, 2, group=NL)],
 "mlb_rookie_of_the_year": [T(1, 0, 1, 2, 3), T(2, 0, 1, 2, 3, group=AL), T(3, 0, 1, 2, 3, group=NL)],
 "mlb_world_series_mvp": [T(1, 0, 1, 2, 3)],
 "mlb_manager_of_the_year": [T(1, 0, 1, 2, group=AL), T(2, 0, 1, 2, group=NL)],
 "mlb_hank_aaron": [dict(ix=1, kind="mlb_hank_aaron")],
 "mlb_gold_glove": [dict(ix=1, kind="positions", group=AL), dict(ix=2, kind="positions", group=NL, skip_years=[1957])],
 "mlb_silver_slugger": [dict(ix=1, kind="positions", group=AL), dict(ix=2, kind="positions", group=NL)],
 "mlb_rolaids_relief_man": [T(1, 0, 1, 2, group=NL), T(2, 0, 1, 2, group=AL)],
 "nfl_super_bowl": [dict(ix=1, kind="superbowl", team_award=1)],
 "nfl_ap_mvp": [T(1, 0, 1, 3, 2, br="‖")], "nfl_super_bowl_mvp": [T(1, 0, 2, 3, 4, mode="end")],
 "nfl_ap_offensive_player": [T(0, 0, 1, 3, 2)], "nfl_ap_defensive_player": [T(0, 0, 1, 3, 2)],
 "cfl_grey_cup": [T(0, 1, 2, team_award=1)], "cfl_grey_cup_mvp": [T(0, 0, 1, 3, 2)],
 "cfl_most_outstanding_player": [T(0, 0, 1, 3, 2)], "cfl_most_outstanding_canadian": [T(0, 0, 1, 3, 2)],
 "cfl_most_outstanding_defensive": [dict(kind="list")], "cfl_most_outstanding_lineman": [dict(kind="list")],
 "cfl_most_outstanding_rookie": [dict(kind="list")], "cfl_special_teams": [dict(kind="list")],
 "cfl_coach_of_the_year": [dict(kind="list")],
}

def cell(c, i): return c[i] if i is not None and i < len(c) else ""

def from_table(code, t, sp, out):
    kind = sp.get("kind")
    for ri, r in enumerate(t["rows"]):
        c = r["cells"]
        if not c: continue
        if kind == "positions":
            hdr = next(x["cells"] for x in t["rows"] if x["hdr"] and x["cells"][0] == "Year")
            if r["hdr"] or not re.match(r"^\d{4}$", c[0]): continue
            y = int(c[0])
            if y in sp.get("skip_years", []): continue
            for ci, h in enumerate(hdr):
                if ci == 0 or h == "Team" or ci >= len(c): continue
                for nm, _ in names(c[ci]):
                    if SKIP.search(nm): continue
                    out.append(dict(i=len(out), t=sp["ix"], r=ri, season=y, year_text=c[0], winner=nm, team=None, position=re.sub(r"[^A-Z0-9]", "", h), group=None if y == 1957 else sp["group"]))
            continue
        if kind == "mlb_mvp":
            if r["hdr"] or not re.match(r"^\d{4}$", c[0]): continue
            for g, wi, ti, pi in ((AL, 1, 2, 3), (NL, 4, 5, 6)):
                nm = name(cell(c, wi))
                if not nm or SKIP.search(nm): continue
                out.append(dict(i=len(out), t=sp["ix"], r=ri, season=int(c[0]), year_text=c[0], winner=nm, team=name(cell(c, ti)), position=name(cell(c, pi)), group=g))
            continue
        if kind == "mlb_hank_aaron":
            if r["hdr"] or not re.match(r"^\d{4}$", c[0]): continue
            out.append(dict(i=len(out), t=sp["ix"], r=ri, season=int(c[0]), year_text=c[0], winner=name(c[2]), team=name(c[3]), position=None, group=name(c[1]) + " League"))
            continue
        if kind == "nba_final":
            if r["hdr"] or not re.match(r"^\d{4}$", c[0]): continue
            m = re.match(r"^(\d+)\s*[–-]\s*(\d+)$", c[3])
            if not m: continue
            w = name(c[1]) if int(m.group(1)) > int(m.group(2)) else name(c[4])
            out.append(dict(i=len(out), t=sp["ix"], r=ri, season=int(c[0]) - 1, year_text=c[0], winner=w, team=None, position=None, group=None))
            continue
        if kind == "superbowl":
            if r["hdr"] or not re.match(r"^([IVXLC]+|\d+)$", c[0]): continue
            s = sb_season(c[1]); w = re.sub(r"(?<=s)[naAN]$|(?<=[a-z])[AN]$", "", name(c[2]))
            if s and w: out.append(dict(i=len(out), t=sp["ix"], r=ri, season=s, year_text=c[1], winner=w, team=None, position=None, group=None))
            continue
        if r["hdr"]: continue
        yt = cell(c, sp["y"])
        ws = [] if sp.get("team_award") else names(cell(c, sp["w"]))
        if sp.get("team_award"): ws = [(name(cell(c, sp["w"])), None)]
        if not ws or any(SKIP.search(w) for w, _ in ws) or SKIP.search(yt): continue
        y = start_year(yt, sp["mode"])
        if y is None: continue
        team = name(cell(c, sp["t"])) if sp.get("t") is not None else None
        if len(set(c)) == 1: continue   # a colspan note row
        pos = (name(cell(c, sp["pos"])) or None) if sp.get("pos") is not None else None
        tm = [name(x) or None for x in cell(c, sp["t"]).split("‖")] if sp.get("t") is not None else []
        ps = [name(x) or None for x in cell(c, sp["pos"]).split("‖")] if sp.get("pos") is not None else []
        for k, (w, role) in enumerate(ws):
            # several people in one cell ("A‖B"): team and position are listed in the same order
            t_k = tm[k] if len(tm) == len(ws) and len(ws) > 1 else team
            p_k = ps[k] if len(ps) == len(ws) and len(ws) > 1 else pos
            out.append(dict(i=len(out), t=sp["ix"], r=ri, season=y, year_text=yt, winner=w, team=t_k or None,
                            position=p_k or role, group=sp.get("group")))

def from_list(text, out, lines):
    m = re.search(r"^==[^=\n]*winners[^\n]*==\s*$", text, re.M | re.I)
    body = text[m.end():]
    n = re.search(r"^==[^=]", body, re.M)
    if n: body = body[:n.start()]
    for ln in body.split("\n"):
        if not ln.startswith("*"): continue
        s = clean(ln.lstrip("*").strip())
        m = re.match(r"^(\d{4})\s*[–-]\s*(.+)$", s)
        if not m: continue
        lines.append(ln.strip())
        body = m.group(2)
        if SKIP.search(body): continue
        if "," in body: who, team = body.rsplit(",", 1)
        else:
            mm = re.match(r"^(.*\))\s+(\S.*)$", body)
            who, team = (mm.group(1), mm.group(2)) if mm else (body, "")
        pm = re.search(r"\(([^)]*)\)\s*$", who)
        out.append(dict(i=len(out), t=None, r=len(lines) - 1, season=int(m.group(1)), year_text=m.group(1), winner=name(who), team=name(team) or None,
                        position=pm.group(1) if pm else None, group=None))

def extract(code, cache):
    text = open(f"{cache}/{code}.wikitext", encoding="utf-8").read()
    tabs, out, used, lines = tables(text, "‖" if any(sp.get("br") for sp in SPEC[code]) else " "), [], [], []
    for sp in SPEC[code]:
        if sp.get("kind") == "list": from_list(text, out, lines); continue
        t = tabs[sp["ix"]]
        keep = [i for i in (sp.get("y"), sp.get("w"), sp.get("t"), sp.get("pos")) if i is not None] if sp.get("y") is not None else None
        keep = sorted(set(keep)) if keep else None
        rows = [[r["cells"][i] if i < len(r["cells"]) else "" for i in keep] if keep else r["cells"] for r in t["rows"]]
        used.append(dict(table=sp["ix"], caption=t["caption"], columns=keep, rows=rows))
        from_table(code, t, sp, out)
    ta = any(sp.get("team_award") for sp in SPEC[code])
    title = TITLES[code]
    doc = dict(award_code=code, source="Wikipedia (en.wikipedia.org), CC BY-SA 4.0", article=title,
               url="https://en.wikipedia.org/wiki/" + title.replace(" ", "_"), fetched=FETCHED, winners_are_teams=ta,
               tables=used, lines=lines, parsed_columns=PCOLS, parsed=[[x[c] for c in PCOLS] for x in out])
    return doc

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--cache", default="raw/wikipedia_awards/cache")
    ap.add_argument("--out", default=f"raw/wikipedia_awards/raw/{FETCHED}"); ap.add_argument("codes", nargs="*")
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    for code in a.codes or SPEC:
        d = extract(code, a.cache)
        p = d["parsed"]
        ys = [x[3] for x in p]
        pa = os.path.join(os.path.dirname(os.path.dirname(a.out.rstrip("/"))), "parsed", os.path.basename(a.out.rstrip("/")))
        os.makedirs(pa, exist_ok=True)
        # raw/: what was read from the article (archived). parsed/: the winner rows worked out from it (loaded).
        raw = {k: v for k, v in d.items() if k not in ("parsed", "parsed_columns")}
        open(f"{a.out}/{code}.json", "w", encoding="utf-8").write(json.dumps(raw, ensure_ascii=False, separators=(",", ":")))
        open(f"{pa}/{code}.json", "w", encoding="utf-8").write(json.dumps({k: d[k] for k in ("award_code", "article", "url", "fetched", "winners_are_teams", "parsed_columns", "parsed")}, ensure_ascii=False, separators=(",", ":")))
        print(f"{code:34s} n={len(p):4d} seasons {min(ys) if ys else '-'}..{max(ys) if ys else '-'}  first={p[0][5] if p else ''} last={p[-1][5] if p else ''}")
