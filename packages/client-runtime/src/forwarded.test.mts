import assert from "node:assert/strict";
import { test } from "node:test";
import { forwardedClientHeaders } from "./forwarded.ts";

test("forwards the edge proxy's X-Forwarded-For and User-Agent as is", () => {
  const h = new Headers({ "x-forwarded-for": "203.0.113.7", "user-agent": "Mozilla/5.0" });
  assert.deepEqual(forwardedClientHeaders(h), { "X-Forwarded-For": "203.0.113.7", "User-Agent": "Mozilla/5.0" });
});

test("keeps the whole chain so the backend can strip trusted hops", () => {
  const h = new Headers({ "x-forwarded-for": "198.51.100.1, 203.0.113.7" });
  assert.equal(forwardedClientHeaders(h)["X-Forwarded-For"], "198.51.100.1, 203.0.113.7");
});

test("adds nothing without a proxy in front", () => {
  assert.deepEqual(forwardedClientHeaders(new Headers()), {});
});

test("passes the captcha token through to the backend", () => {
  const h = new Headers({ "x-captcha-token": "tok-1" });
  assert.equal(forwardedClientHeaders(h)["X-Captcha-Token"], "tok-1");
});
