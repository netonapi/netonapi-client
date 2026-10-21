import assert from "node:assert/strict";
import { test } from "node:test";
import { assertCacheFitsMediaValidity, PUBLIC_CACHE_PROFILES } from "../cache-profiles";
import { reservedPrefixes, resolveSite, robotsDisallow } from "../site";

const base = { origin: "https://www.example.com", consoleBasePath: "/my", locales: { default: "zh-CN", supported: ["zh-CN"], prefix: "none" as const } };

test("resolveSite normalises and applies the build-time origin override", () => {
  const site = resolveSite({ ...base, consoleBasePath: "/my/" }, { NETON_SITE_ORIGIN: "https://preview.example.com" });
  assert.equal(site.origin, "https://preview.example.com");
  assert.equal(site.consoleBasePath, "/my");
  assert.deepEqual(site.auth, { loginMethods: ["password"], defaultCallingCode: "+86" });
  assert.equal(site.timeZone, "Asia/Shanghai");
});

test("resolveSite rejects broken configuration", () => {
  assert.throws(() => resolveSite({ ...base, origin: "https://x.com/path" }), /origin/);
  assert.throws(() => resolveSite({ ...base, consoleBasePath: "/My" }), /consoleBasePath/);
  assert.throws(() => resolveSite({ ...base, locales: { default: "en-US", supported: ["zh-CN"], prefix: "none" } }), /locale/);
  assert.throws(() => resolveSite({ ...base, auth: { loginMethods: [] } }), /loginMethods/);
  assert.throws(() => resolveSite({ ...base, auth: { defaultCallingCode: "86" } }), /CallingCode/);
  assert.throws(() => resolveSite({ ...base, timeZone: "Mars/Olympus" }), /timeZone/);
});

test("cache must not outlive signed media URLs", () => {
  assert.doesNotThrow(() => assertCacheFitsMediaValidity(undefined));
  assert.doesNotThrow(() => assertCacheFitsMediaValidity(PUBLIC_CACHE_PROFILES.static.revalidate * 2));
  assert.throws(() => assertCacheFitsMediaValidity(PUBLIC_CACHE_PROFILES.static.revalidate), /half the signed media URL validity/);
  assert.throws(() => resolveSite({ ...base, media: { signedUrlValiditySeconds: 120 } }), /half/);
});

test("reserved prefixes and robots follow the console prefix", () => {
  const site = resolveSite(base);
  assert.ok(reservedPrefixes(site).includes("/my"));
  assert.deepEqual(robotsDisallow(site).slice(0, 2), ["/my/", "/my$"]);
  assert.deepEqual(robotsDisallow(resolveSite({ ...base, consoleBasePath: "/" })), ["/"], "a console-only product is not indexed at all");
});

test("anonymousPaths: console-at-root products only, route-pattern syntax, no reserved prefixes or overlaps", () => {
  const root = { ...base, consoleBasePath: "/" };
  assert.deepEqual(resolveSite(root).anonymousPaths, []);
  assert.deepEqual(resolveSite({ ...root, anonymousPaths: ["/pricing", "/docs/:slug"] }).anonymousPaths, ["/pricing", "/docs/:slug"]);
  assert.throws(() => resolveSite({ ...base, anonymousPaths: ["/pricing"] }), /only applies when the console sits at "\/"/);
  assert.throws(() => resolveSite({ ...root, anonymousPaths: ["pricing"] }), /anonymousPaths/);
  assert.throws(() => resolveSite({ ...root, anonymousPaths: ["/Pricing"] }), /invalid static segment/);
  assert.throws(() => resolveSite({ ...root, anonymousPaths: ["/"] }), /console home/);
  assert.throws(() => resolveSite({ ...root, anonymousPaths: ["/api/x"] }), /reserved prefix \/api/);
  assert.throws(() => resolveSite({ ...root, anonymousPaths: ["/docs/:slug", "/docs/intro"] }), /overlaps/);
});

test("vitals: same-origin path or https URL, sample rate 0–1", () => {
  assert.equal(resolveSite(base).vitals, null);
  assert.deepEqual(resolveSite({ ...base, vitals: { endpoint: "/api/site/vitals", sampleRate: 0.1 } }).vitals, { endpoint: "/api/site/vitals", sampleRate: 0.1 });
  assert.deepEqual(resolveSite({ ...base, vitals: { endpoint: "https://rum.example.com/v", sampleRate: 1 } }).vitals?.endpoint, "https://rum.example.com/v");
  assert.throws(() => resolveSite({ ...base, vitals: { endpoint: "//evil.example/v", sampleRate: 1 } }), /vitals.endpoint/);
  assert.throws(() => resolveSite({ ...base, vitals: { endpoint: "http://rum.example.com/v", sampleRate: 1 } }), /vitals.endpoint/);
  assert.throws(() => resolveSite({ ...base, vitals: { endpoint: "/api/site/vitals", sampleRate: 1.5 } }), /sampleRate/);
  assert.throws(() => resolveSite({ ...base, vitals: { endpoint: "/api/site/vitals", sampleRate: Number.NaN } }), /sampleRate/);
});
