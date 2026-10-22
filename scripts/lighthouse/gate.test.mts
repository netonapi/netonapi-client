import assert from "node:assert/strict";
import { test } from "node:test";
import { cachedDocument, documentCacheHeader, loadPerCore, median, summarize, type LighthouseRun } from "./gate.mts";

const run = (lcp: number, cls = 0, tbt = 0): LighthouseRun => ({ url: "u", lcp, cls, tbt, fcp: 500, performance: 99, seo: 100, accessibility: 100 });

test("median per metric", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.throws(() => median([]));
});

test("one slow run of three does not fail the gate; a slow median does", () => {
  assert.deepEqual(summarize("u", [run(1500), run(4000), run(1600)]).violations, []);
  assert.deepEqual(summarize("u", [run(2100), run(4000), run(1600)]).violations, ["LCP 2100 ms > 2000 ms"]);
  assert.deepEqual(summarize("u", [run(1000, 0.1, 300)]).violations, ["CLS 0.100 > 0.05", "TBT 300 ms > 200 ms"]);
});

test("only documents served from the page cache count as a measurement", () => {
  assert.equal(cachedDocument("HIT"), true);
  assert.equal(cachedDocument("hit"), true);
  assert.equal(cachedDocument(null), true, "pages without the header (not cached by Next) are measured as they are");
  assert.equal(cachedDocument("MISS"), false, "a blocking render measures the backend, not the page");
  assert.equal(cachedDocument("STALE"), false, "a background regeneration competes with the browser for CPU");
});

test("the document cache header is read from the devtools log", () => {
  const log = [
    { method: "Network.requestWillBeSent", params: {} },
    { method: "Network.responseReceived", params: { type: "Document", response: { url: "http://x/", headers: { "X-Nextjs-Cache": "STALE" } } } },
    { method: "Network.responseReceived", params: { type: "Document", response: { url: "http://x/frame", headers: { "x-nextjs-cache": "HIT" } } } },
  ];
  assert.equal(documentCacheHeader(log), "STALE");
  assert.equal(documentCacheHeader([]), null);
  assert.equal(documentCacheHeader(undefined), null);
  assert.equal(loadPerCore(8, 4), 2);
});
