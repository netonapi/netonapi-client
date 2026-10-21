import assert from "node:assert/strict";
import { test } from "node:test";
import { revalidateSecret, sign, signatureHeader, SIGNATURE_TOLERANCE_SECONDS, verifySignature } from "../signature";

const secret = "s".repeat(32);
const now = 1_792_600_000_000;

test("a signature over t.body verifies within the tolerance window", () => {
  const header = signatureHeader(secret, '{"eventId":"1"}', now);
  assert.equal(verifySignature(header, '{"eventId":"1"}', secret, now), null);
  assert.equal(verifySignature(header, '{"eventId":"1"}', secret, now + SIGNATURE_TOLERANCE_SECONDS * 1000), null);
});

test("tampering, wrong secrets, malformed headers and stale timestamps are rejected", () => {
  const header = signatureHeader(secret, "body", now);
  assert.equal(verifySignature(header, "body!", secret, now), "SIGNATURE_INVALID");
  assert.equal(verifySignature(header, "body", "t".repeat(32), now), "SIGNATURE_INVALID");
  assert.equal(verifySignature(null, "body", secret, now), "SIGNATURE_INVALID");
  assert.equal(verifySignature("t=abc,v1=zz", "body", secret, now), "SIGNATURE_INVALID");
  assert.equal(verifySignature(header, "body", secret, now + (SIGNATURE_TOLERANCE_SECONDS + 1) * 1000), "SIGNATURE_EXPIRED");
});

test("the expected HMAC is the documented one", () => {
  const t = Math.floor(now / 1000);
  assert.equal(signatureHeader(secret, "x", now), `t=${t},v1=${sign(secret, t, "x")}`);
});

test("secrets shorter than 32 bytes disable the channel", () => {
  const prev = process.env.NETON_SITE_REVALIDATE_SECRET;
  process.env.NETON_SITE_REVALIDATE_SECRET = "short";
  assert.equal(revalidateSecret(), null);
  process.env.NETON_SITE_REVALIDATE_SECRET = secret;
  assert.equal(revalidateSecret(), secret);
  if (prev === undefined) delete process.env.NETON_SITE_REVALIDATE_SECRET; else process.env.NETON_SITE_REVALIDATE_SECRET = prev;
});
