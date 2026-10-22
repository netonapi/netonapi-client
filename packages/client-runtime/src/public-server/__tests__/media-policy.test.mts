import assert from "node:assert/strict";
import { test } from "node:test";
import { effectiveMediaValidity, resetEffectiveMediaValidity, setEffectiveMediaValidity } from "../../public/cache-profiles";
import { checkMediaPolicyOnce, parseMediaPolicy, resolveMediaPolicy } from "../media-policy";

const policy = (strategy: string, validitySeconds: number | null) => ({ strategy, validitySeconds, bucketSeconds: validitySeconds ? 1800 : null, imageParams: "tencent" });

test("the backend's validity is the only source", () => {
  assert.deepEqual(resolveMediaPolicy(policy("tencent-a", 3600)), { validitySeconds: 3600, problems: [] });
  assert.deepEqual(resolveMediaPolicy(policy("public", null)), { validitySeconds: null, problems: [] });
  // 没有 CDN：中转地址的短期签名（会员可见内容的图片）也照样约束缓存，但没有可对账的第二个值、不告警
  assert.deepEqual(resolveMediaPolicy(policy("none", 600)), { validitySeconds: 600, problems: [] });
  assert.deepEqual(resolveMediaPolicy(policy("hmac", 40)).problems, [{ code: "VALIDITY_TOO_SHORT", validitySeconds: 40 }]);
});

test("policy payloads are validated", () => {
  assert.equal(parseMediaPolicy(null), null);
  assert.equal(parseMediaPolicy({ strategy: "" }), null);
  assert.equal(parseMediaPolicy({ strategy: "public", validitySeconds: "x" }), null);
  assert.deepEqual(parseMediaPolicy({ strategy: "public" }), { strategy: "public", validitySeconds: null, bucketSeconds: null, imageParams: null });
});

test("the startup check applies the backend validity and logs only real problems", async () => {
  const before = effectiveMediaValidity();
  const logs: string[] = [];
  try {
    resetEffectiveMediaValidity();
    const fetch = (async () => new Response(JSON.stringify({ code: 0, data: policy("none", 600) }))) as typeof globalThis.fetch;
    const result = await checkMediaPolicyOnce({ baseUrl: "http://backend", fetch, log: (level, event) => logs.push(`${level}:${event}`) });
    assert.equal(result.validitySeconds, 600);
    assert.equal(effectiveMediaValidity(), 600);
    assert.deepEqual(logs, ["info:site.media.policy.applied"]);
    const short = (async () => new Response(JSON.stringify({ code: 0, data: policy("hmac", 40) }))) as typeof globalThis.fetch;
    logs.length = 0;
    await checkMediaPolicyOnce({ baseUrl: "http://backend", fetch: short, log: (level, event) => logs.push(`${level}:${event}`) });
    assert.deepEqual(logs, ["error:site.media.policy.invalid", "info:site.media.policy.applied"]);
    const failing = (async () => new Response(JSON.stringify({ code: 404, message: "ROUTE_NOT_FOUND" }), { status: 404 })) as typeof globalThis.fetch;
    await assert.rejects(checkMediaPolicyOnce({ baseUrl: "http://backend", fetch: failing, log: () => {} }), /ROUTE_NOT_FOUND/);
  } finally {
    if (before === undefined) resetEffectiveMediaValidity(); else setEffectiveMediaValidity(before);
  }
});
