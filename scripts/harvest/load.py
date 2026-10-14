"""SQL for DS1: the raw archive row first (its own commit), then the parsed rows of a page or of a Wikidata answer (one transaction each).
Archive first (AGENTS.md section 8): scripts/mac/spx-raw-export.sh copies legacy_files.raw_archive to Dropbox, so a row that is archived is safe even when the
parse below it fails. Every statement is rerunnable: a page revision already loaded is replaced, an archive name already present is left alone."""
import hashlib
import json
import re

import db
from config import PARSER_VERSION


def safe(title):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", title)[:120]


def sha256(b):
    return hashlib.sha256(b).hexdigest()


def archive_sql(name, day, data):
    return ("insert into legacy_files.raw_archive (name, saved_on, sha256, data) values (%s, %s, %s, %s) on conflict (name) do nothing;\n"
            % (db.lit(name), db.lit(str(day)), db.lit(sha256(data)), db.lit(data)))


def _chunks(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def _insert(table, cols, rows, chunk=300):
    out = []
    for part in _chunks(rows, chunk):
        out.append("insert into %s (%s) values\n%s;\n" % (table, ", ".join(cols), ",\n".join("(" + ", ".join(r) + ")" for r in part)))
    return "".join(out)


def page_sql(kind, league, season, title, resolved, revision, revision_at, data, archive_name, fetched_at, parsed):
    """Insert (or replace) the page row and all its parsed rows. `parsed` is parse.parse_page's result."""
    t = "legacy_wikipedia_harvest."
    s = ("insert into {t}page (kind, league, season, title, resolved_title, revision, revision_at, sha256, bytes, archive_name, fetched_at, parser_version, parse_status, parse_error)\n"
         "values ({kind}, {league}, {season}, {title}, {resolved}, {rev}, {revat}, {sha}, {n}, {arch}, {fat}, {pv}, {st}, {err})\n"
         "on conflict (title, revision) do update set kind = excluded.kind, league = excluded.league, season = excluded.season, resolved_title = excluded.resolved_title, "
         "parser_version = excluded.parser_version, parse_status = excluded.parse_status, parse_error = excluded.parse_error, loaded_at = now();\n"
         "select page_id as pid from {t}page where title = {title} and revision = {rev} \\gset\n"
         "delete from {t}infobox_field where page_id = :pid;\ndelete from {t}wikitable_row where page_id = :pid;\n"
         "delete from {t}roster_row where page_id = :pid;\ndelete from {t}draft_pick where page_id = :pid;\n"
         ).format(t=t, kind=db.lit(kind), league=db.lit(league), season=db.lit(season), title=db.lit(title), resolved=db.lit(resolved), rev=int(revision),
                  revat=db.lit(revision_at), sha=db.lit(sha256(data)), n=len(data), arch=db.lit(archive_name), fat=db.lit(fetched_at), pv=PARSER_VERSION,
                  st=db.lit(parsed["status"]), err=db.lit(parsed["error"]))
    s += _insert(t + "infobox_field", ["page_id", "n", "field", "value", "raw", "links"],
                 [[":pid", str(i), db.lit(f["field"]), db.lit(f["value"]), db.lit(f["raw"]), db.lit(f["links"])] for i, f in enumerate(parsed["infobox"])])
    rows, n = [], 0
    for ti, tb in enumerate(parsed["tables"]):
        for ri, r in enumerate(tb.rows):
            rows.append([":pid", str(ti), str(ri), db.lit(tb.section), db.lit(tb.caption), db.lit(tb.header),
                         db.lit(_cells_json(r))])
    s += _insert(t + "wikitable_row", ["page_id", "table_no", "row_no", "section", "caption", "header", "cells"], rows)
    s += _insert(t + "roster_row", ["page_id", "row_no", "src", "group_label", "number", "name", "link_title", "position", "height_in", "weight_lb", "born", "school", "nationality", "note", "raw"],
                 [[":pid", str(i), db.lit(r.get("src", "roster")), db.lit(r["group"]), db.lit(r["number"]), db.lit(r["name"]), db.lit(r["link"]), db.lit(r["position"]), db.lit(r["height_in"]),
                   db.lit(r["weight_lb"]), db.lit(r["born"]) + ("::date" if r["born"] else ""), db.lit(r["school"]), db.lit(r["nationality"]), db.lit(r["note"]), db.lit(r["raw"])]
                  for i, r in enumerate(parsed["roster"])])
    s += _insert(t + "draft_pick", ["page_id", "row_no", "draft_year", "round", "overall", "team", "player", "link_title", "position", "school", "nationality", "note", "raw"],
                 [[":pid", str(i), db.lit(r.get("year") or (season if season else None)), db.lit(r["round"]), db.lit(r["overall"]), db.lit(r["team"]), db.lit(r["player"]),
                   db.lit(r["link"]), db.lit(r["position"]), db.lit(r["school"]), db.lit(r["nationality"]), db.lit(r["note"]), db.lit(r["raw"])]
                  for i, r in enumerate(parsed["draft"])])
    return s


def _cells_json(row):
    return json.dumps([{"t": c["t"], "l": c["l"]} for c in row], ensure_ascii=False, separators=(",", ":"))


def team_members_sql(team_qid, rows, archive_name, fetched_at):
    t = "legacy_wikidata_harvest.team_member"
    s = "delete from %s where team_qid = %s;\n" % (t, db.lit(team_qid))
    s += _insert(t, ["team_qid", "row_no", "person_qid", "person_label", "rank", "start_on", "start_prec", "end_on", "end_prec", "archive_name", "fetched_at"],
                 [[db.lit(team_qid), str(i), db.lit(r["person_qid"]), db.lit(r["person_label"]), db.lit(r["rank"]),
                   db.lit(r["start_on"]) + ("::date" if r["start_on"] else ""), db.lit(r["start_prec"]),
                   db.lit(r["end_on"]) + ("::date" if r["end_on"] else ""), db.lit(r["end_prec"]), db.lit(archive_name), db.lit(fetched_at)]
                  for i, r in enumerate(rows)], chunk=500)
    return s


def items_sql(entities, claim_rows_by_qid, archive_name, fetched_at):
    """entities: {qid: pruned}. Replaces the item row and every claim row of each."""
    t = "legacy_wikidata_harvest."
    s = ""
    items, claims = [], []
    for qid, e in entities.items():
        items.append([db.lit(qid), db.lit(e.get("label")), db.lit(e.get("enwiki")), db.lit(e.get("lastrevid")), db.lit(bool(e.get("missing"))),
                      db.lit((e.get("redirects") or {}).get("to")), db.lit(archive_name), db.lit(fetched_at)])
        claims.extend(claim_rows_by_qid.get(qid, []))
    if not items:
        return s
    qids = ",".join(db.lit(q) for q in entities)
    s += "delete from %sclaim where qid in (%s);\n" % (t, qids)
    s += "delete from %sitem where qid in (%s);\n" % (t, qids)
    s += _insert(t + "item", ["qid", "label", "enwiki_title", "lastrevid", "missing", "redirect_to", "archive_name", "fetched_at"], items)
    s += _insert(t + "claim", ["qid", "prop", "n", "rank", "value_qid", "value_on", "value_prec", "value_num", "unit_qid", "value_text"],
                 [[db.lit(c["qid"]), db.lit(c["prop"]), str(c["n"]), db.lit(c["rank"]), db.lit(c["value_qid"]),
                   db.lit(c["value_on"]) + ("::date" if c["value_on"] else ""), db.lit(c["value_prec"]), db.lit(c["value_num"]), db.lit(c["unit_qid"]),
                   db.lit(c["value_text"])] for c in claims], chunk=500)
    return s
