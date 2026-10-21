import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalQuery, decodeQuerySegment, encodeQuerySegment, MAX_QUERY_VALUE } from "../query";

test("canonicalQuery keeps whitelisted, non-empty, first values in key order", () => {
  const search = new URLSearchParams("utm_source=x&cursor=b&period=week&cursor=c&empty=");
  assert.equal(canonicalQuery(search, ["period", "cursor", "empty"]), "cursor=b&period=week");
  assert.equal(canonicalQuery(search, []), "");
  assert.equal(canonicalQuery(new URLSearchParams(`q=${"x".repeat(MAX_QUERY_VALUE + 1)}`), ["q"]), "");
});

test("segment encoding round-trips unicode and is URL-safe", () => {
  const canonical = canonicalQuery(new URLSearchParams({ q: "手机 评测", cursor: "a/b+c" }), ["q", "cursor"]);
  const segment = encodeQuerySegment(canonical);
  assert.match(segment, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeQuerySegment(segment, ["q", "cursor"]), { cursor: "a/b+c", q: "手机 评测" });
});

test("only the canonical encoding decodes (one cache entry per query)", () => {
  const unordered = encodeQuerySegment("period=week&cursor=b");
  assert.equal(decodeQuerySegment(unordered, ["cursor", "period"]), null);
  assert.equal(decodeQuerySegment(encodeQuerySegment("utm=1"), ["cursor"]), null);
  assert.equal(decodeQuerySegment("_", ["cursor"]), null);
  assert.equal(decodeQuerySegment("not base64!", ["cursor"]), null);
  assert.equal(decodeQuerySegment("", ["cursor"]), null);
});
