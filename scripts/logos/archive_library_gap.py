"""Write SQL that archives the ten Commons files the logo library downloaded and DS1 does not hold.

Reads those files from the local library and writes one insert per file. It does not connect
to a database. The stored name matches the other Commons rows from the same day:
commons-logos/2026-10-15/files/<file> (name, saved_on, sha256, data bytea). A name already
stored is left as it is.

Usage, from the repo root:
  python3 -I scripts/logos/archive_library_gap.py --sql-out ~/Projects/backups/spx-stats/scratchpad/commons-library-gap.sql
"""
import hashlib, os, sys
from pathlib import Path

DAY = "2026-10-15"
# Basenames in the library's files/commons folder that are absent from legacy_files.raw_archive.
FILES = (
    "Dons-logo-1947.jpg",
    "FrankfordYellowjackets27a.gif",
    "Logo_Cobalt_Silver_Kings.gif",
    "Logo_Haileybury_Comets.gif",
    "Minneapolis_Marines_logo_design.png",
    "Newark_Tornadoes_es.png",
    "Racine_Legion.gif",
    "Rochester_Jeffersons_Logo.webp",
    "ToledoT.svg",
    "Toronto_Blueshirts_logo.svg",
)


def library_commons(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if "--dir" in argv:
        i = argv.index("--dir")
        if i + 1 >= len(argv):
            raise SystemExit("archive_library_gap: --dir needs a path")
        return Path(os.path.expanduser(argv[i + 1]))
    return Path.home() / "Projects/backups/spx-stats/logo-library/files/commons"


def archive_name(leaf):
    if leaf not in FILES:
        raise SystemExit("archive_library_gap: refusing a file outside the ten")
    return f"commons-logos/{DAY}/files/{leaf}"


def statement(leaf, data):
    name = archive_name(leaf).replace("'", "''")
    digest = hashlib.sha256(data).hexdigest()
    return (
        "insert into legacy_files.raw_archive (name, saved_on, sha256, data) values "
        f"('{name}', '{DAY}', '{digest}', decode('{data.hex()}', 'hex')) "
        "on conflict (name) do nothing;"
    )


def statements_for(folder):
    folder = Path(folder)
    out = []
    for leaf in FILES:
        path = folder / leaf
        if not path.is_file():
            raise SystemExit(f"archive_library_gap: missing {leaf}")
        out.append(statement(leaf, path.read_bytes()))
    return out


def write_sql(folder, dest):
    body = (
        "-- Ten Commons files from the local logo library, absent from legacy_files.raw_archive.\n"
        + "\n".join(statements_for(folder))
        + "\n"
    )
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    tmp.write_text(body)
    os.replace(tmp, dest)
    return len(FILES)


def main(argv):
    if "--sql-out" not in argv:
        raise SystemExit("usage: archive_library_gap.py --sql-out FILE [--dir DIR]")
    i = argv.index("--sql-out")
    if i + 1 >= len(argv):
        raise SystemExit("archive_library_gap: --sql-out needs a path")
    dest = Path(os.path.expanduser(argv[i + 1]))
    n = write_sql(library_commons(argv), dest)
    print(f"wrote {n} inserts")


if __name__ == "__main__":
    main(sys.argv[1:])
