import assert from "node:assert/strict";
import { test } from "node:test";
import { consoleHref, isConsolePath, loginHref, safeNextPath } from "../next-path";

test("safeNextPath keeps same-site relative paths", () => {
  assert.equal(safeNextPath("/article/1#comments", "/my"), "/article/1#comments");
  assert.equal(safeNextPath("/my/account?tab=a", "/my"), "/my/account?tab=a");
});

test("safeNextPath rejects open redirects and API targets", () => {
  for (const bad of [
    "//evil.com", "/\\evil.com", "https://evil.com", "evil.com", "/%2F%2Fevil.com", "/%5Cevil.com",
    "/api/auth/logout", "/api", "/%61pi/x", "/a\nb", "javascript:alert(1)", "", null, undefined, `/${"a".repeat(3000)}`,
  ]) {
    assert.equal(safeNextPath(bad as string, "/my"), "/my", String(bad));
  }
});

test("console prefix helpers", () => {
  assert.equal(consoleHref("/", "/my"), "/my");
  assert.equal(consoleHref("/account/profile", "/my/"), "/my/account/profile");
  assert.equal(consoleHref("/account/profile", "/"), "/account/profile");
  assert.equal(isConsolePath("/my", "/my"), true);
  assert.equal(isConsolePath("/my/x", "/my"), true);
  assert.equal(isConsolePath("/mything", "/my"), false);
  assert.equal(isConsolePath("/anything", "/"), true);
});

test("loginHref omits next for the console home and encodes the rest", () => {
  assert.equal(loginHref("/my", "/my"), "/login");
  assert.equal(loginHref(null, "/my"), "/login");
  assert.equal(loginHref("/article/1#c", "/my"), "/login?next=%2Farticle%2F1%23c");
  assert.equal(loginHref("//evil.com", "/my"), "/login");
});
