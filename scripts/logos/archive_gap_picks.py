"""Write SQL that archives the Commons files collect_gaps.py found for clubs that had no logo, and their commons_logo rows.

Only the files in PICKS (the ones a person accepted in db/seed/logo_extra_review.csv) are written; every other download stays in the local library.
Reads the bytes from the library's files/commons folder and the file page data from collect/raw.json (the Commons API cache), and does not connect to
a database: the coordinating session applies the SQL with scripts/mac/ds1-apply.sh. Names are free before they are used: a name already stored is left as it is.

Usage, from the repo root:
  python3 -I scripts/logos/archive_gap_picks.py --sql-out ~/Projects/backups/spx-stats/scratchpad/logo-gap-picks-archive.sql [--library DIR]
  ... --picks File_a.png,File_b.svg --day 2026-10-30    other accepted files (names as in db/seed/logo_extra.csv), archived under that day
"""
import hashlib, json, os, sys
from pathlib import Path

DAY = "2026-10-19"
PICKS = ("Las_Vegas_Aces_logo.svg", "Connecticut_Sun_wordmark_logo_2021.png")


def q(v):
    if v is None or v == "":
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def clean_url(u):
    return (u or "").split("?")[0]


def logo_row(leaf, info, data):
    """The commons_logo values of one file, from its imageinfo entry of the sweep cache."""
    i = info.get("File:" + leaf.replace("_", " ")) or info.get("File:" + leaf)
    if not i or i.get("missing"):
        raise SystemExit(f"archive_gap_picks: {leaf} is not in the sweep cache")
    import commons_report
    m = i.get("meta") or {}
    cats = " ; ".join(c for c in (m.get("Categories") or "").split("|") if c)
    return {"file": leaf, "page": i["page"], "url": clean_url(i["url"]), "thumb": clean_url(i.get("thumb")), "mime": i["mime"], "w": i["w"], "h": i["h"],
            "bytes": len(data), "lic": m.get("LicenseShortName") or "", "cls": commons_report.licence_class(m), "restr": m.get("Restrictions") or "", "cats": cats}


def statements(library, picks=PICKS, day=DAY):
    library = Path(library)
    info = json.loads((library / "collect" / "raw.json").read_text())["info"]
    out = []
    for leaf in picks:
        if leaf not in picks:
            raise SystemExit(f"archive_gap_picks: refusing {leaf}: not an accepted pick")
        path = library / "files" / "commons" / leaf
        if not path.is_file():
            raise SystemExit(f"archive_gap_picks: missing {path}")
        data = path.read_bytes()
        name = f"commons-logos/{day}/files/{leaf}"
        out.append("insert into legacy_files.raw_archive (name, saved_on, sha256, data) values "
                   f"({q(name)}, '{day}', '{hashlib.sha256(data).hexdigest()}', decode('{data.hex()}', 'hex')) on conflict (name) do nothing;")
        r = logo_row(leaf, info, data)
        out.append("insert into legacy_team_brand.commons_logo (file, page_url, file_url, thumb_url, mime, width, height, bytes, licence, licence_class, "
                   "restrictions, categories, years_from, years_to, fetched_on, archive_name) values ("
                   f"{q(r['file'])}, {q(r['page'])}, {q(r['url'])}, {q(r['thumb'])}, {q(r['mime'])}, {r['w']}, {r['h']}, {r['bytes']}, {q(r['lic'])}, "
                   f"{q(r['cls'])}, {q(r['restr'])}, {q(r['cats'])}, null, null, '{day}', {q(name)}) on conflict (file) do nothing;")
    return out


def main(argv):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    if "--sql-out" not in argv or argv.index("--sql-out") + 1 >= len(argv):
        raise SystemExit("usage: archive_gap_picks.py --sql-out FILE [--library DIR]")
    dest = Path(os.path.expanduser(argv[argv.index("--sql-out") + 1]))
    lib = Path(os.path.expanduser(argv[argv.index("--library") + 1])) if "--library" in argv else Path.home() / "Projects/backups/spx-stats/logo-library"
    picks = tuple(argv[argv.index("--picks") + 1].split(",")) if "--picks" in argv else PICKS
    day = argv[argv.index("--day") + 1] if "--day" in argv else DAY
    body = "-- Commons files for clubs that had no logo (collect_gaps.py), accepted in db/seed/logo_extra_review.csv. Add-only, rerunnable.\n" + "\n".join(statements(lib, picks, day)) + "\n"
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    tmp.write_text(body)
    os.replace(tmp, dest)
    print(f"wrote {len(picks)} archive inserts and {len(picks)} commons_logo inserts")


if __name__ == "__main__":
    main(sys.argv[1:])
