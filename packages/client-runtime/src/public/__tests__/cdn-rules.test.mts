import assert from "node:assert/strict";
import { test } from "node:test";
import { cdnCacheKey, cdnRules, cdnRulesText } from "../cdn-rules";

const portal = { origin: "https://www.example.com", consoleBasePath: "/my" };
const routes = [
  { pattern: "/channel/:code", query: ["cursor"] },
  { pattern: "/hot", query: ["period", "by"] },
  { pattern: "/article/:id", query: [] },
];

test("rules bypass the console, the API and the auth pages and keep only whitelisted query parameters", () => {
  const r = cdnRules(portal, routes);
  assert.deepEqual(r.bypass.map((b) => b.prefix), ["/my", "/api", "/login", "/register", "/forgot-password"]);
  assert.deepEqual(r.cacheKey.queryKeep, ["by", "cursor", "period"]);
  assert.equal(r.host, "www.example.com");
  assert.match(cdnRulesText(r), /keep only by, cursor, period/);
});

test("cache keys drop tracking parameters, sort the kept ones and skip bypassed paths", () => {
  const r = cdnRules(portal, routes);
  assert.equal(cdnCacheKey(r, "/article/1?utm_source=x&fbclid=y"), "/article/1");
  assert.equal(cdnCacheKey(r, "/hot?period=week&utm_medium=z&by=comments"), "/hot?by=comments&period=week");
  assert.equal(cdnCacheKey(r, "https://www.example.com/channel/latest?cursor=abc"), "/channel/latest?cursor=abc");
  assert.equal(cdnCacheKey(r, "/my/interaction/favorites"), null);
  assert.equal(cdnCacheKey(r, "/my"), null);
  assert.equal(cdnCacheKey(r, "/mything"), "/mything", "a prefix match is per segment");
  assert.equal(cdnCacheKey(r, "/api/backend/app/x"), null);
  assert.equal(cdnCacheKey(r, "/login?next=%2Fmy"), null);
});

test("a console-only product caches nothing but static assets", () => {
  const r = cdnRules({ origin: "https://app.example.com", consoleBasePath: "" }, []);
  assert.equal(r.bypass[0]!.prefix, "/");
  assert.equal(cdnCacheKey(r, "/anything"), null);
});
