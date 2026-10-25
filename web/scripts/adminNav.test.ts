import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ADMIN_SECTIONS, adminPlace } from "../src/lib/adminNav.ts";
import { PHRASES } from "../src/lib/i18n/phrases.constants.ts";

/** Run in web/: pnpm test:adminnav */

const at = (url: string) => {
  const u = new URL(url, "https://x.test");
  return adminPlace(u.pathname, u.searchParams);
};

test("every admin address belongs to a section and tab of the shell", () => {
  assert.deepEqual(at("/admin/data?tab=drift"), { section: "data", tab: "drift" });
  assert.deepEqual(at("/admin/data"), { section: "data", tab: "pending" });
  assert.deepEqual(at("/admin/data?tab=nonsense"), { section: "data", tab: "pending" });
  assert.deepEqual(at("/admin/runs"), { section: "data", tab: "runs" });
  assert.deepEqual(at("/admin/runs/abc123"), { section: "data", tab: "runs" });
  assert.deepEqual(at("/admin/sources"), { section: "data", tab: "sources" });
  assert.deepEqual(at("/admin/people"), { section: "people", tab: "search" });
  assert.deepEqual(at("/admin/people/review"), { section: "people", tab: "review" });
  assert.deepEqual(at("/admin/logos"), { section: "people", tab: "logos" });
  assert.deepEqual(at("/admin/invites"), { section: "people", tab: "invites" });
  assert.deepEqual(at("/admin/tickets"), { section: "tickets", tab: "pending" });
  assert.deepEqual(at("/admin/tickets?status=done"), { section: "tickets", tab: "history" });
  assert.deepEqual(at("/admin/tickets/new"), { section: "tickets", tab: "new" });
  assert.deepEqual(at("/admin/ops"), { section: "ops", tab: "ops" });
  assert.deepEqual(at("/admin/ops/"), { section: "ops", tab: "ops" });
  assert.equal(at("/admin/dev"), null);
  assert.equal(at("/admin/datafoo"), null, "a path that only starts with a section's name is not that section");
});

test("every tab's own address lights that same tab", () => {
  for (const s of ADMIN_SECTIONS) {
    for (const t of s.tabs) assert.deepEqual(at(t.href), { section: s.key, tab: t.key }, `${s.key}/${t.key} -> ${t.href}`);
    assert.equal(at(s.href)?.section, s.key);
  }
});

test("every label of the bar is an English phrase", () => {
  for (const s of ADMIN_SECTIONS) {
    assert.ok(PHRASES[s.label], s.label);
    for (const t of s.tabs) assert.ok(PHRASES[t.label], t.label);
  }
});

test("tab names are unique inside a section", () => {
  for (const s of ADMIN_SECTIONS) assert.equal(new Set(s.tabs.map((t) => t.key)).size, s.tabs.length);
});

/** Every page under app/(dyn)/admin sits inside layout.tsx, which draws the shell for an admin and nothing for anyone else. */
test("the layout draws the shell and the pages keep their own admin check", () => {
  const root = new URL("../src/app/(dyn)/admin/", import.meta.url).pathname;
  const layout = readFileSync(join(root, "layout.tsx"), "utf8");
  assert.match(layout, /<AdminTabs /);
  assert.match(layout, /user\?\.admin/);
  const pages: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f === "page.tsx") pages.push(p);
    }
  };
  walk(root);
  assert.ok(pages.length >= 9, "the admin pages are found");
  // the dev sign-in page checks for itself (a 404 unless next dev runs with SPXN_DEV_LOGIN=1)
  for (const p of pages.filter((x) => !x.includes("/dev/"))) assert.match(readFileSync(p, "utf8"), /requireAdmin\b/, `${p} checks admin itself`);
  assert.ok(existsSync(join(root, "page.tsx")), "/admin has a page that opens the Data section");
});

test("the old addresses are still pages, so bookmarks and the banner's links work", () => {
  const root = new URL("../src/app/(dyn)/admin/", import.meta.url).pathname;
  for (const p of ["data", "runs", "ops", "people", "people/review", "logos", "invites", "tickets", "tickets/new"]) {
    assert.ok(existsSync(join(root, p, "page.tsx")), p);
  }
});
