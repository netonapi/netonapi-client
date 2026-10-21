import assert from "node:assert/strict";
import { test } from "node:test";
import { goneStore, MemoryGoneStore, setGoneStore } from "../gone";
import { syncGoneOnce } from "../gone-sync";
import { verifySignature } from "../signature";

test("the store lives on the process object so proxy and route handlers share it", async () => {
  const store = goneStore();
  await store.add(["/article/1"]);
  const again = (await import(`../gone.ts?copy=${Date.now()}`)) as typeof import("../gone");
  assert.equal(await again.goneStore().has("/article/1"), true);
  setGoneStore(new MemoryGoneStore());
  assert.equal(await goneStore().has("/article/1"), false);
});

test("sync pages through the ledger with signed requests", async () => {
  const secret = "k".repeat(32);
  const store = new MemoryGoneStore();
  const seen: string[] = [];
  const pages: Record<string, unknown> = {
    "": { list: [{ url: "/article/1", goneAt: 1 }, { url: "https://evil/x", goneAt: 1 }], nextCursor: "c2", now: 500 },
    c2: { list: [{ url: "/article/2", goneAt: 2 }], nextCursor: null, now: 600 },
  };
  const fakeFetch = (async (url: string, init: RequestInit) => {
    const u = new URL(url);
    const pathAndQuery = `${u.pathname}${u.search}`;
    seen.push(pathAndQuery);
    const header = new Headers(init.headers).get("X-Neton-Signature");
    assert.equal(verifySignature(header, pathAndQuery, secret), null);
    return Response.json({ code: 0, data: pages[u.searchParams.get("cursor") ?? ""] });
  }) as typeof fetch;
  const now = await syncGoneOnce(0, { secret, baseUrl: "http://backend", store, fetch: fakeFetch });
  assert.equal(now, 600);
  assert.deepEqual(store.list(), ["/article/1", "/article/2"]);
  assert.match(seen[0]!, /^\/platform\/site\/gone\?since=0&limit=1000$/);
});

test("a backend without the site module surfaces ROUTE_NOT_FOUND", async () => {
  const fakeFetch = (async () => Response.json({ code: 10201, message: "ROUTE_NOT_FOUND" }, { status: 404 })) as unknown as typeof fetch;
  await assert.rejects(syncGoneOnce(0, { secret: "k".repeat(32), baseUrl: "http://b", store: new MemoryGoneStore(), fetch: fakeFetch }), /ROUTE_NOT_FOUND/);
});
