import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_REVALIDATE_TAGS, parseRevalidateRequest, RecentEvents, validGonePath } from "../revalidate";

const reserved = ["/my", "/api", "/sitemaps"];

test("a valid request is normalised: expire wins over refresh, paths deduped", () => {
  const r = parseRevalidateRequest(JSON.stringify({
    eventId: "01JB-1",
    items: [{ tag: "obj:content.item:1", mode: "refresh" }, { tag: "obj:content.item:1", mode: "expire" }, { tag: "feed:content.item", mode: "refresh" }],
    gone: ["/article/9", "/article/9"],
  }), reserved);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.request.items, [{ tag: "obj:content.item:1", mode: "expire" }, { tag: "feed:content.item", mode: "refresh" }]);
  assert.deepEqual(r.request.gone, ["/article/9"]);
  assert.deepEqual(r.request.revived, []);
});

test("invalid tags, modes, paths and ids are field errors", () => {
  const r = parseRevalidateRequest(JSON.stringify({ eventId: "bad id", items: [{ tag: "nope", mode: "refresh" }, { tag: "site:nav", mode: "purge" }], gone: ["/my/x", "relative", "/a?b"] }), reserved);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(r.errors.map((e) => `${e.field}:${e.code}`), ["eventId:INVALID_EVENT_ID"]);
  const r2 = parseRevalidateRequest(JSON.stringify({ eventId: "e", items: [{ tag: "nope", mode: "refresh" }, { tag: "site:nav", mode: "purge" }], gone: ["/my/x", "relative", "/a?b"] }), reserved);
  assert.equal(r2.ok, false);
  if (r2.ok) return;
  assert.deepEqual(r2.errors.map((e) => `${e.field}:${e.code}`), ["items[0].tag:INVALID_TAG", "items[1].mode:INVALID_MODE", "gone[0]:INVALID_PATH", "gone[1]:INVALID_PATH", "gone[2]:INVALID_PATH"]);
});

test("oversized batches are refused as a whole and broken JSON is reported", () => {
  const items = Array.from({ length: MAX_REVALIDATE_TAGS + 1 }, (_, i) => ({ tag: `obj:x:${i}`, mode: "refresh" }));
  const r = parseRevalidateRequest(JSON.stringify({ eventId: "e", items }), reserved);
  assert.equal(r.ok ? "" : r.message, "REVALIDATE_TOO_LARGE");
  const j = parseRevalidateRequest("{", reserved);
  assert.equal(j.ok ? "" : j.errors[0]!.code, "INVALID_JSON");
});

test("gone paths must be plain site paths outside reserved prefixes", () => {
  assert.equal(validGonePath("/article/1", reserved), true);
  assert.equal(validGonePath("/mything", reserved), true);
  for (const bad of ["/my", "/my/a", "/api/x", "//x", "/a b", "/a#b", 3]) assert.equal(validGonePath(bad, reserved), false, String(bad));
});

test("event ids are remembered with a bounded window", () => {
  const events = new RecentEvents(2);
  assert.equal(events.remember("a"), true);
  assert.equal(events.remember("a"), false);
  events.remember("b");
  events.remember("c");
  assert.equal(events.remember("a"), true, "the oldest id was evicted");
});
