import assert from "node:assert/strict";
import { test } from "node:test";
import { captchaRequired, parseCaptchaConfig, NO_CAPTCHA } from "./captcha-config.ts";

test("required only for a configured turnstile action", () => {
  const cfg = { provider: "turnstile", siteKey: "k", actions: ["register"] };
  assert.equal(captchaRequired(cfg, "register"), true);
  assert.equal(captchaRequired(cfg, "login"), false);
  assert.equal(captchaRequired({ ...cfg, siteKey: "" }, "register"), false);
  assert.equal(captchaRequired({ ...cfg, provider: "" }, "register"), false);
  assert.equal(captchaRequired(null, "register"), false);
});

test("unparseable config means disabled", () => {
  assert.deepEqual(parseCaptchaConfig(undefined), NO_CAPTCHA);
  assert.deepEqual(parseCaptchaConfig("x"), NO_CAPTCHA);
  assert.deepEqual(parseCaptchaConfig({ provider: "turnstile", siteKey: "k", actions: ["login", 3] }),
    { provider: "turnstile", siteKey: "k", actions: ["login"] });
});
