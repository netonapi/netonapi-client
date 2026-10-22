import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cacheControlFor,
  cacheProfile,
  clampProfileToMedia,
  effectiveMediaValidity,
  PENDING_MEDIA_VALIDITY,
  PUBLIC_CACHE_PROFILES,
  resetEffectiveMediaValidity,
  setEffectiveMediaValidity,
} from "../cache-profiles";

test("media-rendering profiles are clamped to half the signature validity; status profiles are not", () => {
  assert.deepEqual(clampProfileToMedia("object", null), PUBLIC_CACHE_PROFILES.object, "stable URLs never expire");
  assert.equal(clampProfileToMedia("object", 100).revalidate, 50);
  assert.equal(clampProfileToMedia("static", 300).revalidate, 150);
  assert.equal(clampProfileToMedia("list", 3600).revalidate, 30, "already short enough");
  assert.deepEqual(clampProfileToMedia("gone", 100), PUBLIC_CACHE_PROFILES.gone);
  // 还不知道后端策略：按最短的受支持有效期收紧
  assert.equal(clampProfileToMedia("static", undefined).revalidate, PENDING_MEDIA_VALIDITY / 2);
  assert.equal(clampProfileToMedia("object", undefined).revalidate, 60);
});

test("the runtime profile follows the validity the backend reported", () => {
  const before = effectiveMediaValidity();
  try {
    resetEffectiveMediaValidity();
    assert.equal(effectiveMediaValidity(), undefined);
    assert.equal(cacheProfile("static").revalidate, 60, "pending: clamped");
    setEffectiveMediaValidity(200);
    assert.equal(cacheProfile("static").revalidate, 100);
    assert.match(cacheControlFor("static"), /s-maxage=100,/);
    setEffectiveMediaValidity(null);
    assert.equal(cacheProfile("static").revalidate, 300);
    assert.throws(() => setEffectiveMediaValidity(-1));
  } finally {
    if (before === undefined) resetEffectiveMediaValidity(); else setEffectiveMediaValidity(before);
  }
});
