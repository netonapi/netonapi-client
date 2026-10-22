import assert from "node:assert/strict";
import { test } from "node:test";
import { announceSiteReady, signalSiteReady } from "../site-ready";
import { verifySignature } from "../signature";

const secret = "k".repeat(32);

test("the ready signal is signed over the raw body and names the target when configured", async () => {
  const seen: { url: string; body: string }[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    const body = String(init.body);
    assert.equal(verifySignature(new Headers(init.headers).get("X-Neton-Signature"), body, secret), null);
    seen.push({ url, body });
    return Response.json({ code: 0, data: { targets: ["t"], rescheduled: 3 } });
  }) as unknown as typeof fetch;
  assert.deepEqual(await announceSiteReady({ secret, baseUrl: "http://b/", fetch: fakeFetch, target: null }), { ok: true, rescheduled: 3 });
  await announceSiteReady({ secret, baseUrl: "http://b", fetch: fakeFetch, target: "http://portal:3000/api/site/revalidate" });
  assert.equal(seen[0]!.url, "http://b/platform/site/target/ready");
  assert.equal(seen[0]!.body, "{}");
  assert.equal(seen[1]!.body, JSON.stringify({ target: "http://portal:3000/api/site/revalidate" }));
});

test("signalSiteReady retries until the backend answers, and stops for a backend without the site module", async () => {
  let calls = 0;
  const events: string[] = [];
  const flaky = (async () => {
    calls += 1;
    if (calls < 3) throw new TypeError("fetch failed");
    return Response.json({ code: 0, data: { rescheduled: 0 } });
  }) as unknown as typeof fetch;
  await new Promise<void>((resolve) => {
    signalSiteReady({ secret, baseUrl: "http://b", fetch: flaky, target: null, retryMs: [1], log: (e) => { events.push(e); if (e === "site.ready.sent") resolve(); } });
  });
  assert.equal(calls, 3);
  const missing = (async () => Response.json({ code: 10201, message: "ROUTE_NOT_FOUND" }, { status: 404 })) as unknown as typeof fetch;
  await new Promise<void>((resolve) => {
    signalSiteReady({ secret, baseUrl: "http://b", fetch: missing, target: null, retryMs: [1], log: (e, d) => { if (e === "site.ready.unavailable") { assert.equal(d?.code, "ROUTE_NOT_FOUND"); resolve(); } } });
  });
});
