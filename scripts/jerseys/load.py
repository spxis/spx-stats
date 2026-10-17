#!/usr/bin/env python3
"""Load parsed Wikipedia retired-number JSON and Wikidata P1618 JSON into legacy_* tables.

Usage: load.py <file.json> [...]
Connects with libpq (PGHOST, PGPORT, PGUSER, PGDATABASE, PGPASSWORD). Scratch default:
  PGHOST=127.0.0.1 PGPORT=7745 PGUSER=postgres PGDATABASE=spx_stats
"""
import json, os, subprocess, sys


def q(s):
    if s is None:
        return "null"
    return "'" + str(s).replace("'", "''") + "'"


def qn(s):
    if s is None or s == "":
        return "null"
    return q(s)


def qi(v):
    if v is None or v == "":
        return "null"
    return str(int(v))


def qb(v):
    return "true" if v else "false"


def run(sql):
    env = os.environ
    cmd = ["psql", "-v", "ON_ERROR_STOP=1", "-q",
           "-h", env.get("PGHOST", "127.0.0.1"),
           "-p", env.get("PGPORT", "7745"),
           "-U", env.get("PGUSER", "postgres"),
           "-d", env.get("PGDATABASE", "spx_stats")]
    p = subprocess.run(cmd, input=sql, text=True, capture_output=True)
    if p.returncode:
        sys.stderr.write(p.stderr)
        sys.exit(1)
    if p.stdout.strip():
        print(p.stdout.strip())


def load_wikipedia(d):
    code = d["article_code"]
    rows = d.get("rows") or []
    sql = [
        "begin;",
        f"delete from legacy_wikipedia_jersey.retired where article_code = {q(code)};",
        f"delete from legacy_wikipedia_jersey.article where article_code = {q(code)};",
        "insert into legacy_wikipedia_jersey.article "
        "(article_code, league_code, title, url, revision_id, fetched_on, licence) values ("
        f"{q(code)}, {q(d.get('league'))}, {q(d.get('title') or code)}, {q(d.get('url') or '')}, "
        f"{qi(d.get('revision_id'))}, {q(d.get('fetched'))}, {q(d.get('licence') or 'CC BY-SA 4.0')});",
    ]
    for r in rows:
        sql.append(
            "insert into legacy_wikipedia_jersey.retired "
            "(article_code, row_number, league_code, team_name, team_key, jersey_number, "
            "player_name, player_title, player_key, tenure_text, retired_on, retired_text, "
            "league_wide, notes) values ("
            f"{q(code)}, {int(r['row_number'])}, {q(r['league_code'])}, {qn(r.get('team_name'))}, "
            f"{qn(r.get('team_key'))}, {int(r['jersey_number'])}, {qn(r.get('player_name'))}, "
            f"{qn(r.get('player_title'))}, {qn(r.get('player_key'))}, {qn(r.get('tenure_text'))}, "
            f"{qn(r.get('retired_on'))}::date, {qn(r.get('retired_text'))}, {qb(r.get('league_wide'))}, "
            f"{qn(r.get('notes'))});"
        )
    sql.append("commit;")
    run("\n".join(sql))
    print(code, len(rows), "retired")


def load_wikidata(d):
    rows = d.get("rows") or []
    sql = [
        "begin;",
        "truncate legacy_wikidata_jersey.sport_number;",
    ]
    for r in rows:
        sql.append(
            "insert into legacy_wikidata_jersey.sport_number "
            "(qid, jersey_number, team_qid, team_label, from_year, to_year, statement) values ("
            f"{q(r['qid'])}, {int(r['jersey_number'])}, {qn(r.get('team_qid'))}, "
            f"{qn(r.get('team_label'))}, {qi(r.get('from_year'))}, {qi(r.get('to_year'))}, "
            f"{q(r['statement'])}) on conflict do nothing;"
        )
    sql.append("select count(*) from legacy_wikidata_jersey.sport_number;")
    sql.append("commit;")
    run("\n".join(sql))
    print("wikidata_p1618", len(rows), "statements")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.stderr.write("usage: load.py <file.json> [...]\n")
        sys.exit(2)
    for path in sys.argv[1:]:
        d = json.load(open(path, encoding="utf-8"))
        if "article_code" in d:
            load_wikipedia(d)
        elif d.get("property") == "P1618" or "rows" in d and d.get("licence", "").startswith("CC0"):
            load_wikidata(d)
        else:
            sys.stderr.write("unknown file " + path + "\n")
            sys.exit(1)
