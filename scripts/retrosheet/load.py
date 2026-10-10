"""Retrosheet game logs, team list and current-names file -> CSV for
legacy_retrosheet (load with \\copy). Usage: load.py <retrosheet folder> <out folder>"""
import csv, datetime, glob, os, sys
src, out = sys.argv[1:3]
os.makedirs(out, exist_ok=True)
TYPE = {"glws": "worldseries", "gllc": "lcs", "gldv": "division", "glwc": "wildcard", "glas": "allstar", "glct": "tiebreaker"}
N = lambda v: "\\N" if v in ("", None) else v
def d8(v): return f"{v[:4]}-{v[4:6]}-{v[6:8]}"
rows = {}
files = sorted(glob.glob(f"{src}/gl/gl*.txt")) + sorted(glob.glob(f"{src}/post/gl*.txt"))
for path in files:
    stem = os.path.basename(path)[:-4].lower()
    gtype = TYPE.get(stem, "regular")
    for f in csv.reader(open(path, encoding="latin-1")):
        if len(f) < 20:
            continue
        key = (f[0], f[6], f[3], f[1], gtype)
        rows[key] = [d8(f[0]), f[1], gtype, f[3], N(f[4]), N(f[5]), f[6], N(f[7]), N(f[8]), N(f[9]), N(f[10]), N(f[11]),
                     N(f[12]), N(f[13]), N(f[14]), N(f[15]), N(f[16]), N(f[17]), N(f[18]),
                     "{" + ",".join('"' + x.replace("\\", "\\\\").replace('"', '\\"') + '"' for x in f) + "}", os.path.basename(path)]
with open(f"{out}/game_log.csv", "w", newline="") as fo:
    csv.writer(fo).writerows(rows.values())
with open(f"{out}/team.csv", "w", newline="") as fo:
    w = csv.writer(fo)
    for f in csv.reader(open(f"{src}/TEAMABR.TXT", encoding="latin-1")):
        if len(f) >= 6:
            w.writerow([f[0], N(f[1]), N(f[2]), N(f[3]), N(f[4]), N(f[5])])
def mdy(v):
    return datetime.datetime.strptime(v, "%m/%d/%Y").date().isoformat() if v else "\\N"
with open(f"{out}/current_name.csv", "w", newline="") as fo:
    w = csv.writer(fo)
    for f in csv.reader(open(f"{src}/CurrentNames.csv", encoding="latin-1")):
        if len(f) >= 11:
            w.writerow([f[0], f[1], N(f[2]), N(f[3]), N(f[4]), N(f[5]), N(f[6]), mdy(f[7]), mdy(f[8]), N(f[9]), N(f[10])])
print(len(rows), "games from", len(files), "files")
