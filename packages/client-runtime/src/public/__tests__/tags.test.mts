import assert from "node:assert/strict";
import { test } from "node:test";
import { feedTag, isContractTag, MAX_TAG_LENGTH, nodeTag, normalizeTags, objTag, SITE_NAV_TAG, threadTag } from "../tags";

test("tag builders follow the shared naming", () => {
  assert.equal(objTag("content.item", 1024), "obj:content.item:1024");
  assert.equal(feedTag("content.item"), "feed:content.item");
  assert.equal(nodeTag("filter.channel", "latest"), "node:filter.channel:latest");
  assert.equal(threadTag("content.item", "7"), "thread:content.item:7");
  assert.throws(() => objTag("content item", 1), /invalid object type/);
  assert.throws(() => objTag("content.item", "a:b"), /invalid object id/);
});

test("isContractTag accepts exactly the contract shapes", () => {
  for (const ok of ["obj:content.item:1", "feed:comment.comment", "node:content.term:5", "thread:content.item:9", SITE_NAV_TAG, "site:config"]) assert.equal(isContractTag(ok), true, ok);
  for (const bad of ["obj:x", "feed:", "site:other", "random", `feed:${"a".repeat(MAX_TAG_LENGTH)}`]) assert.equal(isContractTag(bad), false, bad);
});

test("normalizeTags dedupes and drops over-long tags", () => {
  assert.deepEqual(normalizeTags(["a", "b", "a", "x".repeat(MAX_TAG_LENGTH + 1)]), ["a", "b"]);
});
