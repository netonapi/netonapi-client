import assert from "node:assert/strict";
import { test } from "node:test";
import { Warmer } from "../warmup";
import { resolveSite, SiteConfigError } from "../../public/site";

const fakeFetch = (seen: string[], status = 200) =>
  (async (url: string) => {
    seen.push(url);
    return new Response("<html></html>", { status, headers: { "x-nextjs-cache": "MISS" } });
  }) as unknown as typeof fetch;

test("warmAll requests every hot path once, in order, against the process itself", async () => {
  const seen: string[] = [];
  const logs: unknown[] = [];
  const w = new Warmer({ paths: ["/", "/channel/latest"], selfUrl: () => "http://localhost:3200/", fetch: fakeFetch(seen), log: (e, d) => logs.push([e, d]) });
  const results = await w.warmAll("test");
  assert.deepEqual(seen, ["http://localhost:3200/", "http://localhost:3200/channel/latest"]);
  assert.deepEqual(results.map((r) => [r.path, r.status, r.cache]), [["/", 200, "MISS"], ["/channel/latest", 200, "MISS"]]);
  assert.equal((logs[0] as [string])[0], "site.warmup.done");
});

test("a failing path is reported but never throws", async () => {
  const logs: [string, Record<string, unknown> | undefined][] = [];
  const w = new Warmer({ paths: ["/"], selfUrl: () => "http://x", fetch: (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch, log: (e, d) => logs.push([e, d]) });
  const [r] = await w.warmAll("test");
  assert.equal(r!.status, null);
  assert.equal(logs[0]![0], "site.warmup.partial");
  assert.deepEqual(logs[0]![1]!.failed, ["/"]);
});

test("concurrent requests coalesce into one more round", async () => {
  const seen: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const slow = (async (url: string) => { seen.push(url); await gate; return new Response("ok"); }) as unknown as typeof fetch;
  const w = new Warmer({ paths: ["/"], selfUrl: () => "http://x", fetch: slow, log: () => {} });
  const a = w.warmAll("a");
  const b = w.warmAll("b");
  void w.warmAll("c");
  release();
  await a; await b;
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(seen.length, 2, "one running round + one coalesced round, not three");
});

test("warmWhenListening waits for the server, then warms; scheduleRewarm debounces expire bursts", async () => {
  let port: string | null = null;
  const seen: string[] = [];
  const w = new Warmer({ paths: ["/"], selfUrl: () => (port ? `http://localhost:${port}` : null), fetch: fakeFetch(seen), readyIntervalMs: 5, rewarmDelayMs: 20, log: () => {} });
  setTimeout(() => { port = "3200"; }, 15);
  await w.warmWhenListening();
  assert.deepEqual(seen, ["http://localhost:3200/robots.txt", "http://localhost:3200/"]);
  seen.length = 0;
  w.scheduleRewarm(); w.scheduleRewarm(); w.scheduleRewarm();
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(seen, ["http://localhost:3200/"], "three expires inside the window → one round");
});

test("site config: warmup defaults to the home page with a portal and is validated", () => {
  const base = { origin: "https://www.example.com", consoleBasePath: "/my", locales: { default: "zh-CN", supported: ["zh-CN"], prefix: "none" as const } };
  assert.deepEqual(resolveSite(base).warmup, { paths: ["/"] });
  assert.deepEqual(resolveSite({ ...base, consoleBasePath: "/" }).warmup, { paths: [] });
  assert.deepEqual(resolveSite({ ...base, warmup: { paths: ["/", "/hot", "/hot"] } }).warmup, { paths: ["/", "/hot"] });
  assert.throws(() => resolveSite({ ...base, warmup: { paths: ["/my/interaction/favorites"] } }), SiteConfigError);
  assert.throws(() => resolveSite({ ...base, warmup: { paths: ["/search?q=x"] } }), SiteConfigError);
  assert.throws(() => resolveSite({ ...base, warmup: { paths: ["hot"] } }), SiteConfigError);
});
