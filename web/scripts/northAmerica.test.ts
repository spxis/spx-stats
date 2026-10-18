import assert from "node:assert/strict";
import { test } from "node:test";
import us from "../node_modules/@johnmorrisdotca/chizu/dist/data/divisions/us.js";
import ca from "../node_modules/@johnmorrisdotca/chizu/dist/data/divisions/ca.js";
import { naPoint, northAmericaMap, NA_SIZE } from "../src/lib/northAmerica.ts";

/** Run in web/: pnpm test:na */
const map = northAmericaMap(us as never, ca as never);
const inside = (code: string, lon: number, lat: number) => {
  const r = map.regions.find((x) => x.code === code)!;
  const p = naPoint(lon, lat)!;
  return p[0] >= r.bbox[0] && p[0] <= r.bbox[2] && p[1] >= r.bbox[1] && p[1] <= r.bbox[3];
};

test("the states and the provinces share one canvas", () => {
  assert.equal(map.regions.length, 48 + 1 + 13);
  assert.ok(!map.regions.some((r) => r.code === "AK" || r.code === "HI"));
  for (const r of map.regions) {
    assert.ok(r.bbox[0] >= 0 && r.bbox[2] <= NA_SIZE.width, `${r.code} within the width`);
    assert.ok(r.bbox[1] >= 0 && r.bbox[3] <= NA_SIZE.height, `${r.code} within the height`);
  }
});

test("a venue falls in its own state or province", () => {
  assert.ok(inside("AZ", -112.07, 33.45), "Phoenix");
  assert.ok(inside("MB", -97.2, 49.89), "Winnipeg");
  assert.ok(inside("ON", -79.38, 43.64), "Toronto");
  assert.ok(inside("QC", -73.57, 45.5), "Montreal");
  assert.ok(inside("FL", -80.33, 26.16), "Sunrise");
  assert.ok(!inside("SK", -112.07, 33.45), "Phoenix is not in Saskatchewan");
});
