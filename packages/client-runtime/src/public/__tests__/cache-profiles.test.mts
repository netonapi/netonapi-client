import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertCacheFitsMediaValidity,
  cacheControlFor,
  cacheProfile,
  clampProfileToMedia,
  effectiveMediaValidity,
  PUBLIC_CACHE_PROFILES,
  setEffectiveMediaValidity,
} from "../cache-profiles";

test("media-rendering profiles are clamped to half the signature validity; status profiles are not", () => {
  assert.deepEqual(clampProfileToMedia("object", undefined), PUBLIC_CACHE_PROFILES.object);
  assert.equal(clampProfileToMedia("object", 100).revalidate, 50);
  assert.equal(clampProfileToMedia("static", 300).revalidate, 150);
  assert.equal(clampProfileToMedia("list", 3600).revalidate, 30, "already short enough");
  assert.deepEqual(clampProfileToMedia("gone", 100), PUBLIC_CACHE_PROFILES.gone);
});

test("the runtime profile follows the effective validity set at startup", () => {
  const before = effectiveMediaValidity();
  try {
    setEffectiveMediaValidity(200);
    assert.equal(cacheProfile("static").revalidate, 100);
    assert.match(cacheControlFor("static"), /s-maxage=100,/);
    setEffectiveMediaValidity(undefined);
    assert.equal(cacheProfile("static").revalidate, 300);
    assert.throws(() => setEffectiveMediaValidity(-1));
  } finally {
    setEffectiveMediaValidity(before);
  }
});

test("the build-time check rejects profiles that outlive their image signatures", () => {
  assert.doesNotThrow(() => assertCacheFitsMediaValidity(3600));
  assert.throws(() => assertCacheFitsMediaValidity(300), /static/);
});
