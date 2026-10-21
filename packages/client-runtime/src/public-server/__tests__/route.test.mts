import assert from "node:assert/strict";
import { test } from "node:test";
import { pathOf, resolveRequest } from "../route";
import { encodeQuerySegment, EMPTY_QUERY_SEGMENT } from "../../public/query";

const home = { pattern: "/", params: {}, query: [], fixed: {} };
const hot = { pattern: "/hot", params: {}, query: ["by", "period"], fixed: {} };
const channel = { pattern: "/channel/:code", params: { code: "code" as const }, query: ["cursor"], fixed: {} };

test("parameterless routes accept the empty query segment (proxy rewrite of the bare address)", () => {
  assert.deepEqual(resolveRequest({ _q: EMPTY_QUERY_SEGMENT }, home), { params: {}, query: {} });
  assert.deepEqual(resolveRequest({ _q: EMPTY_QUERY_SEGMENT }, hot), { params: {}, query: {} });
  assert.deepEqual(resolveRequest({ _q: encodeQuerySegment("by=comments") }, hot), { params: {}, query: { by: "comments" } });
});

test("routes with path parameters refuse the empty query segment: one cache entry per page", () => {
  assert.equal(resolveRequest({ code: "latest", _q: EMPTY_QUERY_SEGMENT }, channel), null);
  assert.deepEqual(resolveRequest({ code: "latest" }, channel), { params: { code: "latest" }, query: {} });
});

test("the build-time sentinel never resolves", () => {
  assert.equal(resolveRequest({ _q: "_" }, home), null);
  assert.equal(resolveRequest({ code: "-" }, channel), null);
});

test("fixed instance parameters are merged after validation", () => {
  assert.deepEqual(resolveRequest({ code: "x" }, { ...channel, fixed: { type: "video" } }), { params: { code: "x", type: "video" }, query: {} });
});

test("ctx.path is the canonical path: no query, fixed instance parameters left out", () => {
  assert.equal(pathOf(channel, { code: "tech" }), "/channel/tech");
  assert.equal(pathOf({ pattern: "/video/:code", fixed: { type: "video" } }, { code: "x", type: "video" }), "/video/x");
  assert.equal(pathOf(home, {}), "/");
});
