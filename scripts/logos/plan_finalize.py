"""Turn the reviewed plans into the seed files the build reads.
Usage: plan_finalize.py <identities.json> <commons plan.csv> <review.csv> <sportslogos plan.csv> <sportslogos fetch dir> <repo root>
  writes  db/seed/logo_extra.csv        every accepted Commons row and every SportsLogos.Net row (the input of db/build/175_team_logo_extra.sql)
          db/seed/logo_extra_review.csv  the decision on every Commons proposal (accepted or rejected, and why), kept as the record of the review
          db/seed/logo_fit.csv           its lines for sl:<key> files replaced: each SportsLogos.Net image has an opaque white background, so it
                                         gets a light tile (bg light) and shows as a deliberate chip on dark pages
A row is given explicit years whenever its team name is worn by more than one identity row of its league (a split era), because the build
matches a seed row to every identity of that name and would otherwise reach all of them. Rerunnable: it overwrites what it writes."""
import csv, json, os, re, sys, collections

ident_f, plan_f, review_f, slplan_f, fetch, root = sys.argv[1:7]
idents = json.load(open(ident_f))
n_of = collections.Counter((r["lg"].split(":")[0] if r["lg"].startswith("other") else r["lg"], r["name"]) for r in idents)
plan = {(r["team"], r["era_from"]): r for r in csv.DictReader(open(plan_f))}
review = list(csv.DictReader(open(review_f)))
images = json.load(open(f"{fetch}/images.json"))

COLS = ["league", "team", "from_year", "to_year", "source", "file_key", "replaces", "note"]
out = []
for v in review:
    if v["decision"] != "accept":
        continue
    p = plan[(v["team"], v["era_from"])]
    shared = n_of[(p["league"].split(":")[0] if p["league"].startswith("other") else p["league"], p["team"])] > 1
    ef, et = int(p["era_from"]), (int(p["era_to"]) if p["era_to"] else None)
    note = p["note"] + ("; the file was chosen by hand for this era" if v["use_file"] else "")
    out.append({"league": "other" if p["league"].startswith("other") else p["league"], "team": p["team"],
                "from_year": ef if shared else "", "to_year": (et - 1 if et else "") if shared else "",
                "source": "wikimedia_commons", "file_key": v["use_file"] or p["file_key"], "replaces": p["replaces"], "note": note})
sl = list(csv.DictReader(open(slplan_f)))
used_sl = set()
for r in sl:
    if r["file_key"] not in images:
        continue
    used_sl.add(r["file_key"])
    out.append({k: r[k] for k in COLS})
out.sort(key=lambda r: (r["league"], r["team"], str(r["from_year"] or 0), r["source"]))
with open(os.path.join(root, "db/seed/logo_extra.csv"), "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=COLS)
    w.writeheader()
    w.writerows(out)
with open(os.path.join(root, "db/seed/logo_extra_review.csv"), "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(review[0]))
    w.writeheader()
    w.writerows(review)

# logo_fit: a light tile for each SportsLogos.Net file in use
fit_path = os.path.join(root, "db/seed/logo_fit.csv")
lines = [l for l in open(fit_path, encoding="utf8").read().splitlines() if not l.startswith("sl:")]
teams_of = collections.defaultdict(set)
for r in sl:
    if r["file_key"] in images:
        teams_of[r["file_key"]].add((r["league"], r["team"]))
buf = []
for key in sorted(used_sl):
    ext = os.path.splitext(images[key]["file"])[1]
    lg, team = sorted(teams_of[key])[0]
    note = "Problem: SportsLogos.Net images carry an opaque white background, a white box on dark pages. Fix: a light tile, so it reads as a deliberate chip."
    buf.append([f"sl:{key}{ext}", lg, team, "false", "", "", "", "1", "0", "0", "light", "approved", note])
import io
sio = io.StringIO()
csv.writer(sio, lineterminator="\n").writerows(buf)
open(fit_path, "w", encoding="utf8").write("\n".join(lines + sio.getvalue().splitlines()) + "\n")
print(len(out), "rows in logo_extra.csv:", collections.Counter(r["source"] for r in out), "|", len(used_sl), "sl logo_fit rows")
