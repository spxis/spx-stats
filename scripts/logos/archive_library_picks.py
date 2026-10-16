"""Write SQL that archives the new logo-library files DS1 does not hold, and the commons_logo rows the seed names.

The ten files in archive_library_gap.py are already in legacy_files.raw_archive. This script does not insert
them again. It inserts five new Commons files, then one commons_logo row per file the new seed uses that
legacy_team_brand.commons_logo does not hold yet (the five, plus eight of the ten). It does not connect to
a database.

Usage, from the repo root:
  python3 -I scripts/logos/archive_library_picks.py --sql-out ~/Projects/backups/spx-stats/scratchpad/logo-picks-archive.sql
"""
import hashlib, json, os, sys
from pathlib import Path

DAY = "2026-10-15"
# Basenames not among the ten already archived.
NEW_FILES = (
    "ProvidenceSteamRoller1922.gif",
    "RenfrewCreameryKings.png",
    "SaskatoonSheiks.png",
    "Tornadoeslogo.gif",
    "Toronto_Blueshirts.svg",
)
# commons_logo rows. archive is False when raw_archive already has commons-logos/<day>/files/<file>.
CATALOG = json.loads(r"""[
{"file":"Logo_Cobalt_Silver_Kings.gif","new":false,"page":"https://commons.wikimedia.org/wiki/File:Logo_Cobalt_Silver_Kings.gif","url":"https://upload.wikimedia.org/wikipedia/commons/0/05/Logo_Cobalt_Silver_Kings.gif","thumb":"https://thumb.wikimedia.org/wikipedia/commons/thumb/0/05/Logo_Cobalt_Silver_Kings.gif/250px-Logo_Cobalt_Silver_Kings.gif","mime":"image/gif","w":750,"h":562,"bytes":87120,"lic":"Public domain","cls":"pd","restr":"trademarked","yf":null,"yt":null,"cats":"Text logos|With trademark|Unidentified logos|PD textlogo|Logo images that should use vector graphics|Template Unknown (author)|GIF that should be converted to SVG"},
{"file":"FrankfordYellowjackets27a.gif","new":false,"page":"https://commons.wikimedia.org/wiki/File:FrankfordYellowjackets27a.gif","url":"https://upload.wikimedia.org/wikipedia/commons/6/66/FrankfordYellowjackets27a.gif","thumb":"https://upload.wikimedia.org/wikipedia/commons/6/66/FrankfordYellowjackets27a.gif","mime":"image/gif","w":119,"h":120,"bytes":4895,"lic":"Public domain","cls":"pd","restr":"","yf":null,"yt":null,"cats":"Text logos|Frankford Yellow Jackets|PD textlogo"},
{"file":"Logo_Haileybury_Comets.gif","new":false,"page":"https://commons.wikimedia.org/wiki/File:Logo_Haileybury_Comets.gif","url":"https://upload.wikimedia.org/wikipedia/commons/1/1a/Logo_Haileybury_Comets.gif","thumb":"https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1a/Logo_Haileybury_Comets.gif/250px-Logo_Haileybury_Comets.gif","mime":"image/gif","w":613,"h":617,"bytes":86238,"lic":"Public domain","cls":"pd","restr":"trademarked","yf":null,"yt":null,"cats":"Text logos|With trademark|Unidentified logos|PD textlogo|Logo images that should use vector graphics|Template Unknown (author)|GIF that should be converted to SVG"},
{"file":"Dons-logo-1947.jpg","new":false,"page":"https://commons.wikimedia.org/wiki/File:Dons-logo-1947.jpg","url":"https://upload.wikimedia.org/wikipedia/commons/0/01/Dons-logo-1947.jpg","thumb":"https://thumb.wikimedia.org/wikipedia/commons/thumb/0/01/Dons-logo-1947.jpg/250px-Dons-logo-1947.jpg","mime":"image/jpeg","w":3882,"h":2828,"bytes":5541150,"lic":"Public domain","cls":"pd","restr":"","yf":1947,"yt":1947,"cats":"Files with no machine-readable author|Files with no machine-readable source|Media missing infobox template|Sports logos of California|PD US no notice|American football logos of the United States|PD-US missing SDC copyright status|Los Angeles Dons"},
{"file":"Minneapolis_Marines_logo_design.png","new":false,"page":"https://commons.wikimedia.org/wiki/File:Minneapolis_Marines_logo_design.png","url":"https://upload.wikimedia.org/wikipedia/commons/8/8a/Minneapolis_Marines_logo_design.png","thumb":"https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8a/Minneapolis_Marines_logo_design.png/250px-Minneapolis_Marines_logo_design.png","mime":"image/png","w":698,"h":697,"bytes":17492,"lic":"CC0","cls":"pd","restr":"","yf":null,"yt":null,"cats":"CC-Zero|Self-published work|Minneapolis Red Jackets"},
{"file":"Racine_Legion.gif","new":false,"page":"https://commons.wikimedia.org/wiki/File:Racine_Legion.gif","url":"https://upload.wikimedia.org/wikipedia/commons/5/5f/Racine_Legion.gif","thumb":"https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5f/Racine_Legion.gif/250px-Racine_Legion.gif","mime":"image/gif","w":450,"h":326,"bytes":18684,"lic":"Public domain","cls":"pd","restr":"trademarked","yf":null,"yt":null,"cats":"Text logos|With trademark|PD textlogo|Unknown date|Sports logos of Wisconsin|Racine Tornadoes|Files uploaded with For the Common Good"},
{"file":"Rochester_Jeffersons_Logo.webp","new":false,"page":"https://commons.wikimedia.org/wiki/File:Rochester_Jeffersons_Logo.webp","url":"https://upload.wikimedia.org/wikipedia/commons/c/cb/Rochester_Jeffersons_Logo.webp","thumb":"https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cb/Rochester_Jeffersons_Logo.webp/250px-Rochester_Jeffersons_Logo.webp","mime":"image/webp","w":750,"h":646,"bytes":13792,"lic":"CC0","cls":"pd","restr":"","yf":null,"yt":null,"cats":"CC-Zero|Template Unknown (author)|WebP logos"},
{"file":"ToledoT.svg","new":false,"page":"https://commons.wikimedia.org/wiki/File:ToledoT.svg","url":"https://upload.wikimedia.org/wikipedia/commons/2/2f/ToledoT.svg","thumb":"https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2f/ToledoT.svg/250px-ToledoT.svg.png","mime":"image/svg+xml","w":512,"h":336,"bytes":478,"lic":"Public domain","cls":"pd","restr":"","yf":null,"yt":null,"cats":"Toledo Maroons|Logos of National Football League teams|PD textlogo|Valid SVG created with Text Editor|Graphic Lab-de|SVG text logos|Logos of Toledo, Ohio|Sports logos of Ohio|Valid SVG created with Inkscape-hand:Text logos|SVG American football logos of the United States"},
{"file":"Toronto_Blueshirts.svg","new":true,"page":"https://commons.wikimedia.org/wiki/File:Toronto_Blueshirts.svg","url":"https://upload.wikimedia.org/wikipedia/commons/f/fa/Toronto_Blueshirts.svg","thumb":"https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fa/Toronto_Blueshirts.svg/250px-Toronto_Blueshirts.svg.png","mime":"image/svg+xml","w":505,"h":522,"bytes":621,"lic":"Public domain","cls":"pd","restr":"","yf":null,"yt":null,"cats":"Sports in Toronto|PD textlogo|SVG text logos|Uploaded with derivativeFX|Ice hockey logos of Canada"},
{"file":"ProvidenceSteamRoller1922.gif","new":true,"page":"https://commons.wikimedia.org/wiki/File:ProvidenceSteamRoller1922.gif","url":"https://upload.wikimedia.org/wikipedia/commons/2/2b/ProvidenceSteamRoller1922.gif","thumb":"https://upload.wikimedia.org/wikipedia/commons/2/2b/ProvidenceSteamRoller1922.gif","mime":"image/gif","w":101,"h":120,"bytes":6292,"lic":"Public domain","cls":"pd","restr":"","yf":1922,"yt":1922,"cats":"Files with no machine-readable author|Files with no machine-readable source|Media missing infobox template|PD US expired|PD-US missing SDC copyright status|Providence Steamrollers (NFL)"},
{"file":"RenfrewCreameryKings.png","new":true,"page":"https://commons.wikimedia.org/wiki/File:RenfrewCreameryKings.png","url":"https://upload.wikimedia.org/wikipedia/commons/4/41/RenfrewCreameryKings.png","thumb":"https://thumb.wikimedia.org/wikipedia/commons/thumb/4/41/RenfrewCreameryKings.png/250px-RenfrewCreameryKings.png","mime":"image/png","w":398,"h":600,"bytes":44677,"lic":"CC0","cls":"pd","restr":"","yf":null,"yt":null,"cats":"CC-Zero|Self-published work|National Hockey Association"},
{"file":"SaskatoonSheiks.png","new":true,"page":"https://commons.wikimedia.org/wiki/File:SaskatoonSheiks.png","url":"https://upload.wikimedia.org/wikipedia/commons/e/e9/SaskatoonSheiks.png","thumb":"https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e9/SaskatoonSheiks.png/250px-SaskatoonSheiks.png","mime":"image/png","w":500,"h":500,"bytes":23661,"lic":"CC0","cls":"pd","restr":"","yf":null,"yt":null,"cats":"CC-Zero|Ice hockey teams in Canada|Creative Commons CC0 1.0 Universal Public Domain Dedication missing SDC copyright license|Ice hockey teams|Self-published work|Self-published work missing SDC copyright license"},
{"file":"Tornadoeslogo.gif","new":true,"page":"https://commons.wikimedia.org/wiki/File:Tornadoeslogo.gif","url":"https://upload.wikimedia.org/wikipedia/commons/f/fd/Tornadoeslogo.gif","thumb":"https://upload.wikimedia.org/wikipedia/commons/f/fd/Tornadoeslogo.gif","mime":"image/gif","w":159,"h":150,"bytes":15380,"lic":"CC BY-SA 4.0","cls":"free","restr":"","yf":null,"yt":null,"cats":"Self-published work|Orange/Newark Tornadoes|GIF logos with transparent background"}
]""")


def library_commons(argv):
    if "--dir" in argv:
        i = argv.index("--dir")
        if i + 1 >= len(argv):
            raise SystemExit("archive_library_picks: --dir needs a path")
        return Path(os.path.expanduser(argv[i + 1]))
    return Path.home() / "Projects/backups/spx-stats/logo-library/files/commons"


def q(v):
    if v is None or v == "":
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def archive_name(leaf):
    return f"commons-logos/{DAY}/files/{leaf}"


def raw_statement(leaf, data):
    if leaf not in NEW_FILES:
        raise SystemExit("archive_library_picks: refusing a file that is not one of the five new Commons files")
    name = archive_name(leaf).replace("'", "''")
    digest = hashlib.sha256(data).hexdigest()
    return (
        "insert into legacy_files.raw_archive (name, saved_on, sha256, data) values "
        f"('{name}', '{DAY}', '{digest}', decode('{data.hex()}', 'hex')) "
        "on conflict (name) do nothing;"
    )


def logo_statement(row):
    return (
        "insert into legacy_team_brand.commons_logo (file, page_url, file_url, thumb_url, mime, width, height, bytes, "
        "licence, licence_class, restrictions, categories, years_from, years_to, fetched_on, archive_name) values ("
        f"{q(row['file'])}, {q(row['page'])}, {q(row['url'])}, {q(row['thumb'])}, {q(row['mime'])}, {q(row['w'])}, {q(row['h'])}, "
        f"{q(row['bytes'])}, {q(row['lic'])}, {q(row['cls'])}, {q(row['restr'])}, {q(row['cats'])}, {q(row['yf'])}, {q(row['yt'])}, "
        f"'{DAY}', {q(archive_name(row['file']))}) on conflict (file) do nothing;"
    )


def statements_for(folder):
    folder = Path(folder)
    raw, logos = [], []
    have = {row["file"] for row in CATALOG}
    if set(NEW_FILES) - have:
        raise SystemExit("archive_library_picks: a new file is missing from the catalog")
    for leaf in NEW_FILES:
        path = folder / leaf
        if not path.is_file():
            raise SystemExit(f"archive_library_picks: missing {leaf}")
        raw.append(raw_statement(leaf, path.read_bytes()))
    for row in CATALOG:
        logos.append(logo_statement(row))
    return raw, logos


def write_sql(folder, dest):
    raw, logos = statements_for(folder)
    body = (
        "-- Five new Commons files, plus commons_logo rows for the seed. The ten already archived are not inserted again.\n"
        + "\n".join(raw + logos)
        + "\n"
    )
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    tmp.write_text(body)
    os.replace(tmp, dest)
    return len(raw), len(logos)


def main(argv):
    if "--sql-out" not in argv:
        raise SystemExit("usage: archive_library_picks.py --sql-out FILE [--dir DIR]")
    i = argv.index("--sql-out")
    if i + 1 >= len(argv):
        raise SystemExit("archive_library_picks: --sql-out needs a path")
    dest = Path(os.path.expanduser(argv[i + 1]))
    n_raw, n_logo = write_sql(library_commons(argv), dest)
    print(f"wrote {n_raw} archive inserts, {n_logo} commons_logo inserts")


if __name__ == "__main__":
    main(sys.argv[1:])
