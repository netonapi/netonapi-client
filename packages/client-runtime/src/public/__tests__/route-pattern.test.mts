import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPath, matchPattern, paramMatchesRule, parsePattern, patternsConflict, patternUnderPrefix, sentinelParam, validateParams } from "../route-pattern";

test("parsePattern accepts static and whole-segment parameters only", () => {
  assert.deepEqual(parsePattern("/"), []);
  assert.deepEqual(parsePattern("/article/:id"), [{ kind: "static", value: "article" }, { kind: "param", name: "id" }]);
  for (const bad of ["article/:id", "/article/", "/Article", "/a/:id/:id", "/a/x:id", "/a/:1", "/a//b", "/a/*"]) {
    assert.throws(() => parsePattern(bad), bad);
  }
});

test("conflicts: same shape or a static segment shadowed by a parameter", () => {
  assert.equal(patternsConflict("/article/:id", "/article/:slug"), true);
  assert.equal(patternsConflict("/article/:id", "/article/latest"), true);
  assert.equal(patternsConflict("/article/:id", "/video/:id"), false);
  assert.equal(patternsConflict("/tag/:slug", "/tag/:slug/rss.xml"), false);
  assert.equal(patternsConflict("/", "/hot"), false);
});

test("reserved prefixes match whole segments", () => {
  assert.equal(patternUnderPrefix("/api/x", "/api"), true);
  assert.equal(patternUnderPrefix("/apix", "/api"), false);
  assert.equal(patternUnderPrefix("/:slug", "/my"), true, "a parameter at the prefix position could capture the console");
  assert.equal(patternUnderPrefix("/my", "/my"), true);
});

test("match and build round-trip with encoding", () => {
  assert.deepEqual(matchPattern("/tag/:slug", "/tag/%E6%89%8B%E6%9C%BA"), { slug: "手机" });
  assert.equal(matchPattern("/tag/:slug", "/tag/a/b"), null);
  assert.equal(matchPattern("/tag/:slug", "/tag/%E0%A4%A"), null, "malformed escapes do not match");
  assert.equal(buildPath("/tag/:slug", { slug: "手机" }), "/tag/%E6%89%8B%E6%9C%BA");
  assert.equal(buildPath("/", {}), "/");
  assert.throws(() => buildPath("/article/:id", {}), /missing parameter/);
});

test("parameter rules", () => {
  assert.equal(paramMatchesRule("1024", "id"), true);
  assert.equal(paramMatchesRule("0", "id"), false);
  assert.equal(paramMatchesRule("01", "id"), false);
  assert.equal(paramMatchesRule("9223372036854775807", "id"), true);
  assert.equal(paramMatchesRule("9223372036854775808", "id"), false, "beyond a signed 64-bit key");
  assert.equal(paramMatchesRule("-12", "int"), true);
  assert.equal(paramMatchesRule("手机", "slug"), true);
  assert.equal(paramMatchesRule("Phone", "slug"), false, "slugs are lower case");
  assert.equal(paramMatchesRule("-x", "slug"), false);
  assert.equal(paramMatchesRule("floor-ai", "code"), true);
  assert.equal(paramMatchesRule("手机", "code"), false);
  assert.equal(paramMatchesRule("week", { enum: ["day", "week"] }), true);
});

test("sentinels never satisfy their rule", () => {
  for (const rule of ["id", "int", "slug", "code", { enum: ["-", "--"] }] as const) {
    assert.equal(paramMatchesRule(sentinelParam(rule), rule), false, JSON.stringify(rule));
  }
});

test("validateParams rejects unknown or invalid parameters", () => {
  assert.deepEqual(validateParams({ id: "7" }, { id: "id" }), { id: "7" });
  assert.equal(validateParams({ id: "x" }, { id: "id" }), null);
  assert.equal(validateParams({ other: "1" }, { id: "id" }), null);
});
