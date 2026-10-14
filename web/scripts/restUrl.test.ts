import assert from "node:assert/strict";
import { test } from "node:test";

/** Run in web/: pnpm test:resturl. SPX_REST_URL (a local PostgREST for the Mac-side build) is honoured only for a loopback address. */
async function restUrl(value: string | undefined): Promise<string> {
  if (value === undefined) delete process.env.SPX_REST_URL;
  else process.env.SPX_REST_URL = value;
  const mod = await import(`../src/lib/api/config.ts?v=${Math.random()}`);
  return mod.REST_URL as string;
}

const PROD = "https://njpvfrceahkvnrduerkk.supabase.co/rest/v1/";

test("without SPX_REST_URL the site reads production", async () => {
  assert.equal(await restUrl(undefined), PROD);
  assert.equal(await restUrl(""), PROD);
});

test("a loopback address is used, with one trailing slash", async () => {
  assert.equal(await restUrl("http://127.0.0.1:3190"), "http://127.0.0.1:3190/");
  assert.equal(await restUrl("http://127.0.0.1:3190//"), "http://127.0.0.1:3190/");
  assert.equal(await restUrl("http://localhost:3190/"), "http://localhost:3190/");
});

test("anything that is not this computer is ignored", async () => {
  for (const v of ["https://evil.example/rest/v1/", "http://127.0.0.1.evil.example/", "http://10.0.0.101:3190/", "https://127.0.0.1:3190/", "http://localhost.evil.example/"]) {
    assert.equal(await restUrl(v), PROD, v);
  }
});
