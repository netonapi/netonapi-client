import assert from "node:assert/strict";
import { test } from "node:test";
import { median, summarize, type LighthouseRun } from "./gate.mts";

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
