"""SPX's saved league season stat tables (<LEAGUE><endyear><Regular|Playoff><Table>.csv)
-> CSV rows for legacy_files.player_season_table.
Usage: player_tables_to_csv.py <folder> <out.csv> <tag>"""
import csv, json, os, re, sys
root, out, tag = sys.argv[1:4]
NAME = re.compile(r"^(NHL|NBA)(\d{4})(Regular|Playoff)(.+)\.csv$", re.I)
POS = {"C", "L", "R", "D", "G", "F", "LW", "RW"}

IDENT = {"PLAYERID": "PlayerID", "PLAYER NAME": "Player", "TEAM": "Team", "POSITION": "Pos"}

def code(h):
    """A column's key: the identity columns by their label (codes vary by
    season, and P means POSITION in one table and points in the next), the
    rest by the code the table printed."""
    h = h.strip()
    m = re.match(r"^\[(.*?):(.*)\]$", h)
    if m:
        c, label = m.group(1).strip(), m.group(2).strip().upper()
        return IDENT.get(label) or c or label.title()
    return IDENT.get(h.strip("[]").upper(), h.strip("[]"))

with open(out, "w", newline="") as f:
    w = csv.writer(f)
    for dp, _, files in os.walk(root):
        for fn in sorted(files):
            m = NAME.match(fn)
            if not m:
                continue
            league = m.group(1).lower(); end = int(m.group(2)); season = f"{end - 1}-{str(end)[2:]}"
            rows = [r for r in csv.reader(open(os.path.join(dp, fn), encoding="latin-1")) if any(c.strip() for c in r)]
            if len(rows) < 2:
                continue
            title, head = (rows[0][0], rows[1]) if len(rows[0]) == 1 else ("", rows[0])
            codes = [code(h) for h in head]
            body = rows[2:] if title else rows[1:]
            seen = {}
            for r in body:
                if len(r) != len(codes):
                    continue
                d = dict(zip(codes, [c.strip() for c in r]))
                pid = d.pop("PlayerID", "")
                if not pid.isdigit():
                    continue
                d.pop("RK", None)
                team, pos = d.pop("Team", ""), d.pop("Pos", None)
                if team in POS and (pos or "") not in POS:  # the source swapped the two columns on some pages
                    team, pos = pos or "", team
                name = d.pop("Player", None)
                stats = {k: (v if v != "" else None) for k, v in d.items()}
                key = (pid, team)
                seen[key] = [league, season, m.group(3).lower(), m.group(4), pid, name, team, pos if pos is not None else "\\N",
                             json.dumps(stats), title or "\\N", fn, "{" + tag + "}"]
            for row in seen.values():
                w.writerow(row)
