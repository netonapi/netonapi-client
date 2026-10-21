import assert from "node:assert/strict";
import { test } from "node:test";
import { effectiveMediaValidity, setEffectiveMediaValidity } from "../../public/cache-profiles";
import { checkMediaPolicyOnce, parseMediaPolicy, reconcileMediaPolicy } from "../media-policy";

const signed = (validitySeconds: number | null) => ({ strategy: "tencent-a", validitySeconds, bucketSeconds: 1800, imageParams: "tencent" });

test("matching validity: no problems", () => {
  assert.deepEqual(reconcileMediaPolicy(3600, signed(3600)), { effective: 3600, problems: [] });
  assert.deepEqual(reconcileMediaPolicy(undefined, signed(null)), { effective: undefined, problems: [] });
});

test("mismatches are reported and the shorter validity wins", () => {
  assert.deepEqual(reconcileMediaPolicy(3600, signed(1200)), { effective: 1200, problems: [{ code: "VALIDITY_MISMATCH", site: 3600, backend: 1200 }] });
  assert.deepEqual(reconcileMediaPolicy(undefined, signed(600)), { effective: 600, problems: [{ code: "SITE_VALIDITY_MISSING", backend: 600 }] });
  assert.deepEqual(reconcileMediaPolicy(3600, signed(null)), { effective: 3600, problems: [{ code: "SITE_EXPECTS_SIGNED", site: 3600 }] });
  assert.deepEqual(reconcileMediaPolicy(40, signed(40)).problems, [{ code: "VALIDITY_TOO_SHORT", effective: 40 }]);
});

test("policy payloads are validated", () => {
  assert.equal(parseMediaPolicy(null), null);
  assert.equal(parseMediaPolicy({ strategy: "" }), null);
  assert.equal(parseMediaPolicy({ strategy: "public", validitySeconds: "x" }), null);
  assert.deepEqual(parseMediaPolicy({ strategy: "public" }), { strategy: "public", validitySeconds: null, bucketSeconds: null, imageParams: null });
});

test("the startup check applies the effective validity and logs mismatches", async () => {
  const before = effectiveMediaValidity();
  const logs: string[] = [];
  try {
    const fetch = (async () => new Response(JSON.stringify({ code: 0, data: signed(1200) }))) as typeof globalThis.fetch;
    const result = await checkMediaPolicyOnce({ siteValidity: 3600, baseUrl: "http://backend", fetch, log: (level, event) => logs.push(`${level}:${event}`) });
    assert.equal(result.effective, 1200);
    assert.equal(effectiveMediaValidity(), 1200);
    assert.deepEqual(logs, ["error:site.media.policy.mismatch"]);
    const failing = (async () => new Response(JSON.stringify({ code: 404, message: "ROUTE_NOT_FOUND" }), { status: 404 })) as typeof globalThis.fetch;
    await assert.rejects(checkMediaPolicyOnce({ siteValidity: 3600, baseUrl: "http://backend", fetch: failing, log: () => {} }), /ROUTE_NOT_FOUND/);
  } finally {
    setEffectiveMediaValidity(before);
  }
});
