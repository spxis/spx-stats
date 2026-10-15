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

test("the preview's compose service is accepted only with SPX_PREVIEW=1, and only that name", async () => {
  delete process.env.SPX_PREVIEW;
  assert.equal(await restUrl("http://pgrst:3000/"), PROD);
  process.env.SPX_PREVIEW = "1";
  assert.equal(await restUrl("http://pgrst:3000"), "http://pgrst:3000/");
  for (const v of ["http://pgrst.evil.example:3000/", "http://pgrst@evil.example/", "https://pgrst:3000/", "http://other:3000/", "http://192.0.2.101:3190/"]) {
    assert.equal(await restUrl(v), PROD, v);
  }
  delete process.env.SPX_PREVIEW;
});

test("SPX_REVALIDATE shortens the cache time only in preview mode, and only within bounds", async () => {
  async function seconds(preview: string | undefined, value: string | undefined): Promise<number> {
    if (preview === undefined) delete process.env.SPX_PREVIEW; else process.env.SPX_PREVIEW = preview;
    if (value === undefined) delete process.env.SPX_REVALIDATE; else process.env.SPX_REVALIDATE = value;
    return (await import(`../src/lib/api/config.ts?v=${Math.random()}`)).REVALIDATE as number;
  }
  assert.equal(await seconds(undefined, "300"), 86400);
  assert.equal(await seconds("1", undefined), 86400);
  assert.equal(await seconds("1", "300"), 300);
  for (const v of ["5", "0", "-1", "86400", "999999", "abc", "1.5", ""]) assert.equal(await seconds("1", v), 86400, v);
  delete process.env.SPX_PREVIEW;
  delete process.env.SPX_REVALIDATE;
});

test("anything that is not this computer is ignored", async () => {
  for (const v of ["https://evil.example/rest/v1/", "http://127.0.0.1.evil.example/", "http://192.0.2.101:3190/", "https://127.0.0.1:3190/", "http://localhost.evil.example/"]) {
    assert.equal(await restUrl(v), PROD, v);
  }
});
