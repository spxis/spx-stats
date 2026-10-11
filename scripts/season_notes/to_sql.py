#!/usr/bin/env python3
"""Print an insert-only SQL file from db/seed/season_note.csv, for production (Supabase MCP execute_sql, or psql).
Existing notes are left alone (on conflict do nothing). Usage: python3 scripts/season_notes/to_sql.py [--update]
--update replaces the text of notes that already exist, for an edit."""
import csv, pathlib, sys

q = lambda v: "null" if v in (None, "") else "'" + v.replace("'", "''") + "'"
n = lambda v: "null" if v in (None, "") else str(int(v))
conflict = ("do update set games_planned = excluded.games_planned, games_usual = excluded.games_usual, note_en = excluded.note_en, "
            "note_fr = excluded.note_fr, note_ja = excluded.note_ja, source_id = excluded.source_id, source_url = excluded.source_url"
            if "--update" in sys.argv else "do nothing")
path = pathlib.Path(__file__).resolve().parents[2] / "db/seed/season_note.csv"
for r in csv.DictReader(path.open(encoding="utf-8", newline="")):
    fk = r["franchise_key"]
    fid = ("(select f.franchise_id from core.franchise f join meta.source fs on fs.source_id = f.source_id "
           f"where fs.code = {q(fk.split(':')[0])} and f.source_key = {q(fk.split(':')[1])})") if fk else "null"
    print("insert into core.season_note (season_id, franchise_id, kind, games_planned, games_usual, note_en, note_fr, note_ja, source_id, source_url)\n"
          f"select s.season_id, {fid}, {q(r['kind'])}, {n(r['games_planned'])}, {n(r['games_usual'])}, {q(r['note_en'])}, {q(r['note_fr'])}, "
          f"{q(r['note_ja'])}, (select source_id from meta.source where code = {q(r['source'])}), {q(r['source_url'])}\n"
          f"from core.season s where s.league_code = {q(r['league'])} and s.start_year = {n(r['year'])}\n"
          f"on conflict (season_id, coalesce(franchise_id, 0), kind) {conflict};")
