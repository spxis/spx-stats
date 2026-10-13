import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveVenue, venueSlugs, WIKIDATA_ID, type SlugInput } from "../src/lib/venueSlug.ts";

/** Run in web/: pnpm test:venues */

const v = (id: string, name: string, wid: string | null = null, city: string | null = null): SlugInput => ({ id, name, wid, city });

test("a slug is the name made plain, and is the name's alone when nobody shares it", () => {
  const s = venueSlugs([v("1", "Stade Olympique", "Q1"), v("2", "Maple Leaf Gardens"), v("3", "Rogers Centre"), v("4", "Montréal Forum & Arena")]);
  assert.deepEqual([...s.values()], ["stade-olympique", "maple-leaf-gardens", "rogers-centre", "montreal-forum-and-arena"]);
});

test("a name two venues share takes the city, and then the Wikidata id when the city is the same too", () => {
  const s = venueSlugs([
    v("a", "Memorial Stadium", "Q10", "baltimore"), v("b", "Memorial Stadium", "Q11", "minneapolis"),
    v("c", "Civic Arena", "Q20", "Winnipeg, MB"), v("d", "Civic Arena", "Q21", "Winnipeg, MB"), v("e", "Civic Arena", null, "Winnipeg, MB"), v("f", "Civic Arena", null, "Winnipeg, MB"),
    v("g", "Forum", "Q30"), v("h", "Forum", "Q31"),
  ]);
  assert.equal(s.get("a"), "memorial-stadium-baltimore");
  assert.equal(s.get("b"), "memorial-stadium-minneapolis");
  assert.equal(s.get("c"), "civic-arena-winnipeg-mb-q20");
  assert.equal(s.get("d"), "civic-arena-winnipeg-mb-q21");
  assert.equal(s.get("g"), "forum-q30");
  assert.equal(s.get("h"), "forum-q31");
  // two with no id to tell them apart are numbered, in id order
  assert.deepEqual([s.get("e"), s.get("f")], ["civic-arena-winnipeg-mb", "civic-arena-winnipeg-mb-2"]);
});

test("every slug is unique, whatever the names, and the same input in any order gives the same slugs", () => {
  const list: SlugInput[] = [
    v("1", "Arena"), v("2", "Arena", "Q2", "Austin"), v("3", "Arena", "Q3", "Austin"), v("4", "Arena Austin", "Q4"), v("5", "arena-austin-q2"),
    v("6", "Q612227"), v("7", "q612227"), v("8", "!!!"), v("9", "***"), v("10", "Dome", "Q9", "Reno"), v("11", "Dome", "Q8", "Reno"),
  ];
  const a = venueSlugs(list);
  assert.equal(new Set(a.values()).size, list.length, [...a.values()].join(" "));
  const b = venueSlugs([...list].reverse());
  for (const [id, slug] of a) assert.equal(b.get(id), slug, id);
  for (const slug of a.values()) assert.ok(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug), slug);
});

test("no slug can be mistaken for a Wikidata id", () => {
  const s = venueSlugs([v("1", "Q612227"), v("2", "q5"), v("3", "Q1")]);
  for (const slug of s.values()) assert.ok(!WIKIDATA_ID.test(slug), slug);
});

test("a Wikidata id in the address goes to the venue's own, a slug opens it, anything else is nothing", () => {
  const bySlug = new Map([["olympic-stadium", { name: "Olympic Stadium" }], ["rogers-centre", { name: "Rogers Centre" }]]);
  const byWid = new Map([["Q612227", "olympic-stadium"], ["Q99", "gone"]]);
  assert.deepEqual(resolveVenue(bySlug, byWid, "rogers-centre"), { venue: { name: "Rogers Centre" }, redirect: null });
  assert.deepEqual(resolveVenue(bySlug, byWid, "Q612227"), { venue: { name: "Olympic Stadium" }, redirect: "olympic-stadium" });
  assert.equal(resolveVenue(bySlug, byWid, "q612227").redirect, "olympic-stadium", "the id in any case");
  assert.deepEqual(resolveVenue(bySlug, byWid, "Q99"), { venue: null, redirect: null }, "an id whose venue is not on the list");
  assert.deepEqual(resolveVenue(bySlug, byWid, "Q1"), { venue: null, redirect: null });
  assert.deepEqual(resolveVenue(bySlug, byWid, "nowhere"), { venue: null, redirect: null });
});
