import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { countryArgs, isPlainLeague } from "../src/lib/playerCountryModel.ts";
import { groupTeams, idFilter, SHOWN_TEAMS, split, stintLine, TEAM_SEGMENT, tooltip, yearsText, type TeamRow } from "../src/lib/playerTeamModel.ts";
import { QUERY_KEYS } from "../src/lib/routing.ts";

/** Run in web/: pnpm test:playerteams. The Teams column and the team choice of /players: the shaping of api.player_teams, the address value, and migration 098. */

const row = (person_id: number, franchise_id: number, first_year: number, last_year = first_year, seasons = last_year - first_year + 1): TeamRow =>
  ({ person_id, franchise_id, league: "nhl", first_year, last_year, seasons });
const lib = (name: string) => readFileSync(new URL(`../src/lib/${name}`, import.meta.url), "utf8");
const migration = readFileSync(new URL("../../db/migrations/098_player_teams.sql", import.meta.url), "utf8");

test("each player's teams come in the order he played for them, the earliest first, ties by last season then franchise", () => {
  const by = groupTeams([row(1, 30, 2005, 2008), row(2, 10, 1999), row(1, 20, 1998, 2004), row(1, 25, 1998, 2001), row(1, 22, 1998, 2001)]);
  assert.deepEqual(by.get(1)!.map((r) => r.franchise_id), [22, 25, 20, 30]);
  assert.deepEqual(by.get(2)!.map((r) => r.franchise_id), [10]);
  assert.equal(by.get(3), undefined);
});

test("at most four are drawn and the rest are counted", () => {
  assert.equal(SHOWN_TEAMS, 4);
  const six = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(split(six), { shown: [1, 2, 3, 4], more: [5, 6] });
  assert.deepEqual(split([1, 2, 3, 4]), { shown: [1, 2, 3, 4], more: [] });
  assert.deepEqual(split([]), { shown: [], more: [] });
  assert.deepEqual(split(six, 2).more.length, 4);
});

test("a tooltip line is the club and its years; one season is one year", () => {
  assert.equal(yearsText(1999, 1999), "1999");
  assert.equal(yearsText(1999, 2004), "1999–2004");
  assert.equal(stintLine("Montréal Canadiens", { first_year: 1979, last_year: 1995 }), "Montréal Canadiens 1979–1995");
  assert.equal(tooltip(["A 1999", "B 2000–2002"]), "A 1999\nB 2000–2002");
});

test("the read asks for each player of the page once", () => {
  assert.equal(idFilter([3, 1, 3, 2]), "person_id=in.(3,1,2)");
});

test("a team address is lower case words and digits joined by hyphens, and nothing that could reach a query", () => {
  for (const ok of ["montreal-canadiens", "new-york-rangers", "7", "chicago-white-sox-2"]) assert.ok(TEAM_SEGMENT.test(ok), ok);
  for (const bad of ["", "Montreal", "-a", "a-", "a--b", "a b", "a,b", "a)or(x", "a.b", "é", "%7B%7D"]) assert.ok(!TEAM_SEGMENT.test(bad), bad);
});

test("team is a query key (so a list with it is drawn for the request), a parameter of the list API with a 400, and a filter of the readers", () => {
  assert.ok((QUERY_KEYS as readonly string[]).includes("team"));
  const params = lib("listParams.ts");
  assert.match(params, /team: z\.preprocess\(blank, z\.string\(\)\.max\(80\)\.regex\(TEAM_SEGMENT/);
  const api = lib("listApi.ts");
  assert.match(api, /param: "team", message: "needs league=/);
  assert.match(api, /param: "team", message: `no team called that/);
  assert.match(lib("playerIndex.ts"), /franchise_id=eq\.\$\{f\.team\}/);
});

test("the A to Z row and the country section follow the team choice", () => {
  assert.equal(countryArgs({ league: "nhl", team: 12 }), "p_by=last&p_league=nhl&p_franchise=12");
  assert.ok(!isPlainLeague({ league: "nhl", team: 12 }), "a team is not answered from the all-time league views");
  assert.match(lib("playerIndex.ts"), /p_franchise=\$\{f\.team\}/);
});

test("migration 098: the views, the filter by franchise on the lists, and the two functions made again with p_franchise", () => {
  assert.match(migration, /create or replace view api\.player_teams as/);
  assert.match(migration, /create or replace view api\.player_team_search as/);
  assert.match(migration, /grant select on api\.player_teams to anon, authenticated/);
  assert.match(migration, /grant select on api\.player_team_search to anon, authenticated/);
  assert.match(migration, /union all/, "a plain union cannot be driven by franchise or person through the index");
  assert.ok(!/materialized view api\.player_index|alter table|drop table|drop view/.test(migration), "api.player_index is not touched, nothing is dropped but the two functions");
  for (const fn of ["player_letters", "player_countries"]) {
    assert.match(migration, new RegExp(`drop function if exists api\\.${fn}\\(`));
    assert.match(migration, new RegExp(`create function api\\.${fn}\\(`));
  }
  assert.equal((migration.match(/p_franchise is null or exists \(select 1 from api\.player_teams t where t\.person_id = s\.person_id and t\.franchise_id = p_franchise\)/g) ?? []).length, 2);
  // the same filters as before: the bodies of 091 and 096 are kept line for line
  const old = readFileSync(new URL("../../db/migrations/091_player_letters.sql", import.meta.url), "utf8");
  for (const piece of ["(p_nat is null or s.country = upper(p_nat))", "and l.letter ~ '^[a-z]$'"]) assert.ok(old.includes(piece) && migration.includes(piece), piece);
});
