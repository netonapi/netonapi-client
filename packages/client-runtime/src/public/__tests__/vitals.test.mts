import assert from "node:assert/strict";
import { test } from "node:test";
import { deviceClassOf, parseVitalsLog, parseVitalsPayload, percentile, vitalsReport, type VitalsSample } from "../vitals";

const payload = (over: Record<string, unknown> = {}) => JSON.stringify({
  v: 1, route: "content.item", pattern: "/article/:id", path: "/article/12", nav: "navigate", device: "mobile", conn: "4g",
  metrics: [{ name: "LCP", value: 1800.5, rating: "good", id: "v5-1-1" }, { name: "CLS", value: 0.02, rating: "good", id: "v5-1-2" }],
  ...over,
});

test("payload: one sample per metric, everything validated, whole payload rejected on any error", () => {
  const s = parseVitalsPayload(payload(), 1000)!;
  assert.equal(s.length, 2);
  assert.deepEqual(s[0], { type: "web-vital", ts: 1000, id: "v5-1-1", name: "LCP", value: 1800.5, rating: "good", route: "content.item", pattern: "/article/:id", path: "/article/12", nav: "navigate", device: "mobile", conn: "4g" });
  assert.ok(parseVitalsPayload(payload({ route: null, pattern: null }), 1));
  for (const bad of [
    "not json", JSON.stringify([]), payload({ v: 2 }), payload({ path: "/a?b=1" }), payload({ path: "https://x" }), payload({ device: "watch" }),
    payload({ nav: "x" }), payload({ conn: "5g" }), payload({ route: "Bad Key" }), payload({ metrics: [] }),
    payload({ metrics: [{ name: "FID", value: 1, rating: "good", id: "a" }] }),
    payload({ metrics: [{ name: "LCP", value: -1, rating: "good", id: "a" }] }),
    payload({ metrics: [{ name: "CLS", value: 11, rating: "good", id: "a" }] }),
    payload({ metrics: [{ name: "LCP", value: 1, rating: "ok", id: "a" }] }),
    payload({ metrics: [{ name: "LCP", value: 1, rating: "good", id: "a" }, { name: "LCP", value: 2, rating: "good", id: "b" }] }),
    payload({ metrics: [{ name: "LCP", value: 1, rating: "good", id: "has space" }] }),
    payload({ path: `/${"a".repeat(5000)}` }),
  ]) assert.equal(parseVitalsPayload(bad, 1), null, bad.slice(0, 120));
});

test("device classes follow the portal breakpoints", () => {
  assert.equal(deviceClassOf(390), "mobile");
  assert.equal(deviceClassOf(768), "tablet");
  assert.equal(deviceClassOf(1199), "tablet");
  assert.equal(deviceClassOf(1200), "desktop");
});

test("p75 is nearest-rank", () => {
  assert.equal(percentile([]), null);
  assert.equal(percentile([5]), 5);
  assert.equal(percentile([1, 2, 3, 4]), 3);
  assert.equal(percentile([4, 1, 3, 2, 5, 6, 7, 8]), 6);
});

function sample(name: VitalsSample["name"], value: number, device: VitalsSample["device"], i: number, pattern = "/article/:id"): VitalsSample {
  return { type: "web-vital", ts: i, id: `v5-${i}-${name}`, name, value, rating: "good", route: "content.item", pattern, path: "/article/1", nav: "navigate", device, conn: "4g" };
}

test("report: site and per-route p75 by device, gated only with enough samples, insufficient data flagged", () => {
  const samples: VitalsSample[] = [];
  for (let i = 0; i < 60; i += 1) {
    samples.push(sample("LCP", i < 45 ? 2000 : 4000, "mobile", i));
    samples.push(sample("INP", 100, "mobile", i));
    samples.push(sample("CLS", 0.01, "mobile", i));
    samples.push(sample("LCP", 1000, "desktop", 100 + i, "/"));
  }
  const r = vitalsReport(samples, { minSamples: 50 });
  const row = (group: string, device: string, name: string) => r.rows.find((x) => x.group === group && x.device === device && x.name === name)!;
  assert.equal(row("(site)", "mobile", "LCP").p75, 2000, "45 of 60 at 2000 ms: p75 is 2000");
  assert.equal(row("(site)", "mobile", "LCP").ok, true);
  assert.equal(row("/", "desktop", "LCP").p75, 1000);
  assert.deepEqual(r.errors, []);
  assert.ok(r.insufficient.some((x) => x.includes("desktop INP")), r.insufficient.join("; "));
  samples.push(...Array.from({ length: 10 }, (_, i) => sample("LCP", 9000, "mobile", 1000 + i)));
  const worse = vitalsReport(samples, { minSamples: 50 });
  assert.ok(worse.errors.some((e) => e.startsWith("(site) mobile LCP p75 4000 ms > 2500 ms")), worse.errors.join("; "));
});

test("report: a re-reported metric (same id) counts once, with its last value", () => {
  const first = sample("CLS", 0.5, "mobile", 1);
  const last = { ...first, value: 0.05, ts: 2 };
  const r = vitalsReport([first, last], { minSamples: 1 });
  const cls = r.rows.find((x) => x.group === "(site)" && x.device === "mobile" && x.name === "CLS")!;
  assert.equal(cls.count, 1);
  assert.equal(cls.p75, 0.05);
});

test("log parsing: sample lines with or without a log prefix, everything else ignored, since filter", () => {
  const a = JSON.stringify(sample("LCP", 1, "mobile", 10));
  const b = JSON.stringify(sample("LCP", 2, "mobile", 20));
  const text = [`2026-10-22 [info] ${a}`, "random line", "{\"type\":\"other\"}", b, "{\"type\":\"web-vital\",broken"].join("\n");
  assert.equal(parseVitalsLog(text).length, 2);
  assert.equal(parseVitalsLog(text, { since: 15 }).length, 1);
});
