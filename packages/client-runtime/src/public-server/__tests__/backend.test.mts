import assert from "node:assert/strict";
import { test } from "node:test";
import { createPublicBackend, isPublicBackendError, PublicBackendError } from "../backend";

function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; headers: Headers }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: new Headers(init.headers) });
    return handler(url, init);
  }) as typeof fetch;
  return { fn, calls };
}

test("returns data, sends no identity and dedupes identical GETs", async () => {
  const f = fakeFetch(() => Response.json({ code: 0, data: { ok: 1 } }));
  const backend = createPublicBackend({ baseUrl: "http://b/", fetch: f.fn });
  const [a, b] = await Promise.all([backend.get("/app/x", { limit: 3, empty: "", none: null }), backend.get("/app/x", { limit: 3 })]);
  assert.deepEqual(a, { ok: 1 });
  assert.equal(a, b);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0]!.url, "http://b/app/x?limit=3");
  assert.equal(f.calls[0]!.headers.has("authorization"), false);
  assert.equal(f.calls[0]!.headers.has("cookie"), false);
  assert.equal(f.calls[0]!.headers.has("x-forwarded-for"), false);
});

test("machine codes surface as PublicBackendError", async () => {
  const backend = createPublicBackend({ baseUrl: "http://b", fetch: fakeFetch(() => Response.json({ code: 10201, message: "CHANNEL_NOT_FOUND" }, { status: 404 })).fn });
  const error = await backend.get("/app/channel/x").catch((e: unknown) => e);
  assert.ok(isPublicBackendError(error, "CHANNEL_NOT_FOUND"));
  assert.equal((error as PublicBackendError).status, 404);
});

test("unreachable, timeouts and non-envelope bodies throw instead of returning empty data", async () => {
  const down = createPublicBackend({ baseUrl: "http://b", fetch: (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch });
  await assert.rejects(down.get("/app/x"), (e: unknown) => isPublicBackendError(e, "BACKEND_UNREACHABLE"));
  const slow = createPublicBackend({ baseUrl: "http://b", requestTimeoutMs: 20, fetch: ((_: string, init: RequestInit) => new Promise((_r, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)))) as typeof fetch });
  await assert.rejects(slow.get("/app/x"), (e: unknown) => isPublicBackendError(e, "BACKEND_TIMEOUT"));
  const html = createPublicBackend({ baseUrl: "http://b", fetch: fakeFetch(() => new Response("<html>", { status: 502 })).fn });
  await assert.rejects(html.get("/app/x"), (e: unknown) => isPublicBackendError(e, "INVALID_RESPONSE"));
});

test("only anonymous /app reads are allowed", () => {
  const backend = createPublicBackend({ baseUrl: "http://b", fetch: fakeFetch(() => Response.json({ code: 0 })).fn });
  assert.throws(() => backend.get("/admin/system/user/page"), /only anonymous \/app/);
});

test("dynamic routes can forward client headers", async () => {
  const f = fakeFetch(() => Response.json({ code: 0, data: [] }));
  await createPublicBackend({ baseUrl: "http://b", fetch: f.fn, headers: { "X-Forwarded-For": "203.0.113.9" } }).get("/app/search");
  assert.equal(f.calls[0]!.headers.get("x-forwarded-for"), "203.0.113.9");
});
