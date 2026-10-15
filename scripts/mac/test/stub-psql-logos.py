#!/usr/bin/env python3
"""Stand-in for psql, used only by hosted-logos-test.sh. It answers the two queries of scripts/logos/export_hosted.py from fixtures:
STUB_REFERENCED  file with the logo_url values core.franchise_brand points at under /team-logos/, one per line
STUB_ROWS        file with the archived logos, one per line: hosted_path <TAB> sha256 <TAB> bytes as hex
STUB_LOG         file that gets the whole argument list of each call (the password must never be in it) and PGPASSWORD's presence
"""
import os, sys

args = sys.argv[1:]
sql = args[args.index("-c") + 1] if "-c" in args else ""
with open(os.environ["STUB_LOG"], "a") as f:
    f.write("argv=%s pgpassword_set=%s read_only=%s host=%s\n" % (" ".join(args), bool(os.environ.get("PGPASSWORD")),
            "default_transaction_read_only=on" in os.environ.get("PGOPTIONS", ""), os.environ.get("PGHOST")))
if "raw_archive" in sql:
    sys.stdout.write(open(os.environ["STUB_ROWS"]).read())
elif "core.franchise_brand" in sql:
    sys.stdout.write(open(os.environ["STUB_REFERENCED"]).read())
else:
    sys.stderr.write("stub psql: unexpected query\n")
    sys.exit(2)
