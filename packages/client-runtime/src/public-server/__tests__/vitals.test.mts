import assert from "node:assert/strict";
import { test } from "node:test";
import { createVitalsHandler, createVitalsLimiter, vitalsClientKey } from "../vitals";

const body = JSON.stringify({ v: 1, route: "content.item", pattern: "/article/:id", path: "/article/1", nav: "navigate", device: "desktop", conn: "unknown", metrics: [{ name: "INP", value: 64, rating: "good", id: "v5-9-9" }] });
const post = (raw: string, headers: Record<string, string> = {}) => new Request("https://www.example.com/api/site/vitals", { method: "POST", body: raw, headers: { "content-type": "text/plain", ...headers } });

test("collector writes one JSON line per metric and answers 204 no-store", async () => {
  const lines: string[] = [];
  const handler = createVitalsHandler({ sink: { write: async (l) => { lines.push(l); } }, now: () => 5 });
  const res = await handler(post(body));
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]!), { type: "web-vital", ts: 5, id: "v5-9-9", name: "INP", value: 64, rating: "good", route: "content.item", pattern: "/article/:id", path: "/article/1", nav: "navigate", device: "desktop", conn: "unknown" });
});

test("collector rejects invalid and oversized payloads without writing", async () => {
  const lines: string[] = [];
  const handler = createVitalsHandler({ sink: { write: async (l) => { lines.push(l); } } });
  const bad = await handler(post("{}"));
  assert.equal(bad.status, 400);
  assert.equal(((await bad.json()) as { message: string }).message, "VITALS_INVALID");
  assert.equal((await handler(post("x".repeat(5000)))).status, 400);
  assert.deepEqual(lines, []);
});

test("collector rate-limits per client address (rightmost X-Forwarded-For hop)", async () => {
  const handler = createVitalsHandler({ sink: { write: async () => {} }, limiter: createVitalsLimiter(2) });
  const from = (ip: string) => ({ "x-forwarded-for": `9.9.9.9, ${ip}` });
  assert.equal((await handler(post(body, from("1.1.1.1")))).status, 204);
  assert.equal((await handler(post(body, from("1.1.1.1")))).status, 204);
  const limited = await handler(post(body, from("1.1.1.1")));
  assert.equal(limited.status, 429);
  assert.equal(((await limited.json()) as { message: string }).message, "VITALS_RATE_LIMITED");
  assert.equal((await handler(post(body, from("2.2.2.2")))).status, 204, "another client has its own bucket");
  assert.equal(vitalsClientKey(new Headers()), "local");
});

test("limiter windows reset after a minute", () => {
  let t = 0;
  const limit = createVitalsLimiter(1, () => t);
  assert.equal(limit("a"), true);
  assert.equal(limit("a"), false);
  t = 60_000;
  assert.equal(limit("a"), true);
});
