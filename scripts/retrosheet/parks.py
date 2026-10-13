"""Retrosheet's park list (ballparks.csv from https://www.retrosheet.org/ballparks.zip; parkcode.txt is the older MLB-only copy, same columns) -> SQL for legacy_retrosheet.park (migration 067).
Usage: parks.py <ballparks.csv> --sql-out FILE      (apply the file with scripts/mac/ds1-apply.sh)
Rerunnable: the table is emptied and filled again. Retrosheet's notice: "The information used here was obtained free of charge
from and is copyrighted by Retrosheet. Interested parties may contact Retrosheet at www.retrosheet.org." """
import csv, datetime, sys
src, flag, out = sys.argv[1:4]
assert flag == "--sql-out"
def q(v):
    return "null" if v in ("", None) else "'" + v.replace("'", "''") + "'"
def mdy(v):
    return q(datetime.datetime.strptime(v, "%m/%d/%Y").date().isoformat()) if v else "null"
rows = []
for f in csv.DictReader(open(src, encoding="latin-1")):
    rows.append(f"({q(f['PARKID'])}, {q(f['NAME'])}, {q(f['AKA'])}, {q(f['CITY'])}, {q(f['STATE'])}, {mdy(f['START'])}, {mdy(f['END'])}, {q(f['LEAGUE'])}, {q(f['NOTES'])})")
with open(out, "w") as fo:
    fo.write("begin;\ndelete from legacy_retrosheet.park;\n")
    fo.write("insert into legacy_retrosheet.park (park_id, name, aka, city, state, start_on, end_on, league, notes) values\n")
    fo.write(",\n".join(rows) + ";\ncommit;\n")
print(len(rows), "parks")
