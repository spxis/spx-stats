"""Retrosheet play-by-play event files (events/<year>eve.zip, <year>post.zip, <year>as.zip) -> the batted balls that carry a hit-location
zone, for legacy_retrosheet.batted_ball (see db/migrations/071_legacy_batted_ball.sql and db/build/202_batted_ball.sql).

Usage: python3 -I scripts/retrosheet/events.py <folder of zips> <out folder>
Writes batted_ball.csv, batted_ball_coverage.csv, unknown_zone.csv and load.sql (the two tables emptied and filled with COPY ... FROM STDIN
in one file, for scripts/mac/ds1-apply.sh --force).

Nothing is unpacked to disk: each zip is read in memory. A play is kept when its modifiers (the part after the first "/") hold a
trajectory letter (G ground ball, L line drive, F fly ball, P pop-up; BG, BP, BL for a bunt) followed by a zone code, e.g. "S8/L8S",
"7/F78D", "S5/G15". The zone column holds one of the 68 zones of https://www.retrosheet.org/location.htm (the same codes as kyogijo's
RETROSHEET_ZONES). Files of 1988-2000 also use codes the diagram does not draw (7M, 8LD, 13S, 78XDW...): those are mapped to the zone
they refine (normalise_zone) and the code as written goes in zone_raw; a code with no sure home (3L, 5L, 2L, 2R, 46) has zone null.
A trajectory with no zone is only counted (batted_ball_coverage). seq is the number of the play in its game (NP lines not counted). The
pitcher is the fielding team's pitcher after every start and sub record; hands come from the team rosters (.ROS) and badj/padj records
(a switch hitter bats against the pitcher's hand).

Retrosheet's notice: "The information used here was obtained free of charge from and is copyrighted by Retrosheet. Interested
parties may contact Retrosheet at www.retrosheet.org." """
import csv, io, os, re, sys, zipfile
from collections import Counter

# The 68 zones, as in kyogijo's RETROSHEET_ZONES (src/frames.providers.ts): 44 near the plate and the foul ground, 24 in the outfield.
NEAR = ("2 2F 1S 1 25 23 25F 23F 15 13 5S 3S 56S 34S 6S 4S 6MS 4MS 6M 4M 5F 3F 5 3 56 34 6 4 5D 3D 5DF 3DF 56D 34D 6D 4D 6MD 4MD "
        "7LSF 9LSF 7LF 9LF 7LDF 9LDF").split()
RINGS = {"7L": ["S", "", "D"], "7": ["S", "", "D"], "78": ["S", "", "D", "XD"], "8": ["S", "", "D", "XD"], "89": ["S", "", "D", "XD"],
         "9": ["S", "", "D"], "9L": ["S", "", "D"]}
ZONES = frozenset(NEAR + [c + r for c, rs in RINGS.items() for r in rs])
assert len(ZONES) == 68, len(ZONES)

# Files of 1988-2000 also use codes the diagram does not draw. These are mapped to the zone they refine; the code as written is kept in
# zone_raw. A code with no sure home (3L, 5L, 2L, 2R, 46...) keeps zone null and its text in zone_raw.
OUTFIELD_M = re.compile(r"^(7L?|78|89|9L?|7|9|8)M(F?)$")        # M = medium: the diagram's plain column (7M = 7, 9LMF = 9LF)
CENTRE_HALF = re.compile(r"^8[LR](M|S|D|XD)$")                    # centre field cut into left and right halves (8LD = 8D, 8RM = 8)
FIXED = {"13S": "13", "15S": "15", "2LF": "2F", "2RF": "2F", "3SF": "3F", "5SF": "5F"}


def normalise_zone(raw):
    """The diagram's zone for a code as written, or None when there is no sure one."""
    if raw in ZONES:
        return raw
    if raw.endswith("W"):                                           # warning-track suffix
        return normalise_zone(raw[:-1])
    m = OUTFIELD_M.match(raw)
    if m:
        z = raw.replace("M", "", 1)
        return z if z in ZONES else None
    m = CENTRE_HALF.match(raw)
    if m:
        z = "8" + ("" if m.group(1) == "M" else m.group(1))
        return z if z in ZONES else None
    return FIXED.get(raw)


TRAJ_RE = re.compile(r"^(B?)([GLFP])(\w*)$")
NOT_TRAJ = {"BF", "FL", "FO", "FDP", "FINT", "PASS"}      # a modifier that only looks like a trajectory
BASIC = [(re.compile(r"^S\d*$"), "single"), (re.compile(r"^D(\d*|GR)$"), "double"), (re.compile(r"^T\d*$"), "triple"),
         (re.compile(r"^(HR|H)\d*$"), "home_run"), (re.compile(r"^E\d$"), "error"), (re.compile(r"^FC\d?$"), "fielders_choice"),
         (re.compile(r"^\d"), "out")]
BIP = {"single", "double", "triple", "home_run", "error", "fielders_choice", "out"}
DP_MODS = {"DP", "GDP", "LDP", "FDP", "TP", "GTP", "LTP"}
GTYPE = {"eve": "regular", "post": "post", "as": "allstar"}
N = lambda v: "\\N" if v in ("", None) else v


def parse_event(ev):
    """(result, traj, zone, zone_as_written, sac, dp) for one event string: zone is one of the 68 (or None), zone_as_written the code in the
    file (None when there was none); result None when the play is not a batted ball in play."""
    ev = ev.strip().rstrip("!?#+")
    main = ev.split(".", 1)[0]
    parts = main.split("/")
    basic, mods = parts[0], parts[1:]
    result = None
    for rx, name in BASIC:
        if rx.match(basic):
            result = name
            break
    traj = zone = None
    zone_seen = None
    sac = None
    dp = False
    for m in mods:
        m = m.rstrip("+-!?#")           # + hard hit, - soft hit, and the scorer's doubt marks
        if m in ("SF", "SH"):
            sac = m
        if m in DP_MODS:
            dp = True
        if m in NOT_TRAJ:
            continue
        t = TRAJ_RE.match(m)
        if not t or traj:
            continue
        bunt, letter, rest = t.groups()
        if rest == "":
            traj = bunt + letter
        elif rest[0].isdigit():
            traj, zone_seen = bunt + letter, rest
            zone = normalise_zone(rest)
    return result, traj, zone, zone_seen, sac, dp


def read_rosters(z, year, hands):
    for name in z.namelist():
        if name.upper().endswith(".ROS"):
            for f in csv.reader(io.StringIO(z.read(name).decode("latin-1"))):
                if len(f) >= 5:
                    hands[f[0]] = (f[3], f[4])      # bats L/R/B, throws L/R


def games_of(text):
    game = None
    for line in text.splitlines():
        if line.startswith("id,"):
            if game:
                yield game
            game = [line]
        elif game is not None:
            game.append(line)
    if game:
        yield game


def main():
    src, out = sys.argv[1:3]
    os.makedirs(out, exist_ok=True)
    hands = {}
    seen = set()
    cov = Counter()            # (year, game_type, what): plays, bip (balls in play), traj, zoned (any zone code), located (one of the 68)
    unknown = Counter()
    files = sorted(f for f in os.listdir(src) if f.endswith(".zip"))
    nrows = 0
    with open(f"{out}/batted_ball.csv", "w", newline="") as fo:
        w = csv.writer(fo)
        for fn in files:
            m = re.match(r"^(\d{4})(eve|post|as)\.zip$", fn)
            if not m:
                continue
            year, kind = int(m.group(1)), m.group(2)
            gtype = GTYPE[kind]
            z = zipfile.ZipFile(f"{src}/{fn}")
            read_rosters(z, year, hands)
            for name in sorted(z.namelist()):
                if not re.search(r"\.EV[A-Z]$", name.upper()):
                    continue
                for game in games_of(z.read(name).decode("latin-1")):
                    gid = game[0].split(",")[1]
                    if gid in seen:
                        print("duplicate game", gid, file=sys.stderr)
                        continue
                    seen.add(gid)
                    team = {0: None, 1: None}
                    pitcher = {0: None, 1: None}    # fielding side 0 = visitors
                    badj, padj = {}, {}
                    seq = 0
                    for line in game[1:]:
                        f = line.split(",")
                        k = f[0]
                        if k == "info" and len(f) > 2:
                            if f[1] == "visteam": team[0] = f[2]
                            elif f[1] == "hometeam": team[1] = f[2]
                        elif k in ("start", "sub") and len(f) >= 6:
                            if f[5] == "1":
                                pitcher[int(f[3])] = f[1]
                        elif k == "badj" and len(f) >= 3:
                            badj[f[1]] = f[2]
                        elif k == "padj" and len(f) >= 3:
                            padj[f[1]] = f[2]
                        elif k == "play" and len(f) >= 7:
                            seq += 1
                            inning, half, batter, ev = int(f[1]), int(f[2]), f[3], f[6]
                            if ev.startswith("NP"):
                                seq -= 1
                                continue
                            cov[(year, gtype, "plays")] += 1
                            fld = 1 - half
                            pit = pitcher[fld]
                            bat_adj = badj.pop(batter, None)
                            pit_adj = padj.pop(pit, None) if pit else None
                            result, traj, zone, zone_seen, sac, dp = parse_event(ev)
                            if result is None:
                                continue
                            cov[(year, gtype, "bip")] += 1
                            if traj is None:
                                continue
                            cov[(year, gtype, "traj")] += 1
                            if zone_seen is None:
                                continue
                            cov[(year, gtype, "zoned")] += 1
                            if zone is None:
                                unknown[(year, zone_seen)] += 1
                            else:
                                cov[(year, gtype, "located")] += 1
                            if zone == zone_seen:
                                zone_seen = None
                            pthrow = pit_adj or (hands.get(pit, (None, None))[1] if pit else None)
                            bats = bat_adj or hands.get(batter, (None, None))[0]
                            if bats == "B":
                                bats = {"R": "L", "L": "R"}.get(pthrow)
                            w.writerow([gid, seq, year, gtype, inning, half, batter, N(pit), N(team[half]), N(team[fld]),
                                        result, traj, N(zone), N(zone_seen), N(bats), N(pthrow), N(sac), "t" if dp else "f"])
                            nrows += 1
    with open(f"{out}/batted_ball_coverage.csv", "w", newline="") as fo:
        w = csv.writer(fo)
        for (year, gtype) in sorted({(y, g) for y, g, _ in cov}):
            w.writerow([year, gtype] + [cov[(year, gtype, c)] for c in ("plays", "bip", "traj", "zoned", "located")])
    with open(f"{out}/unknown_zone.csv", "w", newline="") as fo:
        csv.writer(fo).writerows(sorted((y, c, n) for (y, c), n in unknown.items()))
    cols = "game_id, seq, season, game_type, inning, half, batter, pitcher, bat_team, fld_team, result, traj, zone, zone_raw, bat_hand, pit_hand, sac, dp"
    with open(f"{out}/load.sql", "w") as fo:
        for table, cols_, name in (("batted_ball", cols, "batted_ball.csv"),
                                   ("batted_ball_coverage", "season, game_type, plays, balls_in_play, with_trajectory, with_zone, located", "batted_ball_coverage.csv")):
            fo.write(f"delete from legacy_retrosheet.{table};\ncopy legacy_retrosheet.{table} ({cols_}) from stdin with (format csv, null '\\N');\n")
            with open(f"{out}/{name}") as fi:
                for chunk in iter(lambda: fi.read(1 << 20), ""):
                    fo.write(chunk)
            fo.write("\\.\n")
    print(nrows, "batted balls with a zone code from", len(seen), "games;", sum(unknown.values()), "of them with no place on the diagram")


if __name__ == "__main__":
    main()
