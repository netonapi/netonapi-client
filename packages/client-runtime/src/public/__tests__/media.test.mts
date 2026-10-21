import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import * as React from "react";
import {
  aspectRatio,
  defaultMediaLoader,
  MEDIA_REFRESH_ENDPOINT,
  MEDIA_REFRESH_SCRIPT,
  mediaImageAttributes,
  mediaLoader,
  setMediaLoader,
  shareImageUrl,
  type PublicMedia,
} from "../media";
import { MediaImage } from "../media-image";

const variants = Object.fromEntries([180, 360, 720, 1080, 1440].map((w) => [`w${w}`, `https://cdn.example.com/a.jpg?w=${w}&sign=x`]));
const signed: PublicMedia = { fileId: "file_a", url: "https://cdn.example.com/a.jpg?sign=x", width: 1600, height: 900, variants: { ...variants, og: "https://cdn.example.com/a.jpg?og&sign=x" } };
const plain: PublicMedia = { fileId: "file_b", url: "https://cdn.example.com/b.png" };

test("the default loader picks the smallest width ≥ 2× the display width and lists only the widths that image can use", () => {
  const out = defaultMediaLoader({ media: signed, displayWidth: 180 });
  assert.equal(out.src, variants.w360);
  assert.equal(out.variant, "w360");
  assert.equal(out.srcSet, [180, 360].map((w) => `${variants[`w${w}`]} ${w}w`).join(", "), "a 180-wide thumbnail needs 1× and 2× only");
  assert.equal(defaultMediaLoader({ media: signed, displayWidth: 720 }).srcSet, [360, 720, 1080, 1440].map((w) => `${variants[`w${w}`]} ${w}w`).join(", "), "body images keep the narrow-screen widths");
  assert.equal(defaultMediaLoader({ media: signed, displayWidth: 1200 }).src, variants.w1440, "falls back to the largest width");
  assert.deepEqual(defaultMediaLoader({ media: plain, displayWidth: 720 }), { src: plain.url });
});

test("attributes: intrinsic size, lazy by default, priority is eager + high", () => {
  const lazy = mediaImageAttributes({ media: signed, alt: "A" }, defaultMediaLoader);
  assert.equal(lazy.loading, "lazy");
  assert.equal(lazy.decoding, "async");
  assert.equal(lazy.fetchPriority, undefined);
  assert.equal(lazy.width, 1600);
  assert.equal(lazy.height, 900);
  assert.equal(lazy.sizes, "(max-width: 720px) 100vw, 720px");
  assert.equal(lazy["data-neton-media"], "file_a");
  assert.equal(lazy["data-neton-variant"], "w1440");
  const eager = mediaImageAttributes({ media: signed, alt: "A", priority: true, displayWidth: 360 }, defaultMediaLoader);
  assert.equal(eager.loading, "eager");
  assert.equal(eager.fetchPriority, "high");
  assert.equal(eager.src, variants.w720);
  const onscreen = mediaImageAttributes({ media: signed, alt: "A", eager: true }, defaultMediaLoader);
  assert.equal(onscreen.loading, "eager", "eager: not lazy-loaded");
  assert.equal(onscreen.fetchPriority, undefined, "eager: no raised priority");
  assert.equal(onscreen.decoding, "async");
});

test("MediaImage: eager images get no raised priority (React's own preload hint stays at normal priority)", () => {
  const html = renderToStaticMarkup(React.createElement(MediaImage, { media: signed, alt: "A", eager: true }));
  assert.match(html, /loading="eager"/);
  assert.doesNotMatch(html, /fetchpriority|fetchPriority/);
});

test("attributes: an aspect placeholder gives width/height even without the original size (no CLS)", () => {
  const a = mediaImageAttributes({ media: plain, alt: "", aspect: "3:2" }, defaultMediaLoader);
  assert.equal(a.width, 1200);
  assert.equal(a.height, 800);
  assert.deepEqual(a.style, { aspectRatio: String(1.5), objectFit: "cover" });
  assert.equal(a.srcSet, undefined);
  assert.equal(a.sizes, undefined);
  const cropped = mediaImageAttributes({ media: signed, alt: "", aspect: "1:1" }, defaultMediaLoader);
  assert.equal(cropped.width, 1600);
  assert.equal(cropped.height, 1600);
  assert.equal(mediaImageAttributes({ media: plain, alt: "" }, defaultMediaLoader).width, undefined);
  assert.equal(aspectRatio("16:9"), 16 / 9);
  assert.throws(() => aspectRatio(0));
});

test("the loader is replaceable site-wide", () => {
  const original = mediaLoader();
  try {
    setMediaLoader(({ media }) => ({ src: `${media.url}#custom` }));
    assert.equal(mediaImageAttributes({ media: plain, alt: "" }).src, `${plain.url}#custom`);
  } finally {
    setMediaLoader(original);
  }
});

test("share images prefer the og variant", () => {
  assert.deepEqual(shareImageUrl(signed), { url: signed.variants!.og, width: 1200, height: 675 });
  assert.deepEqual(shareImageUrl({ ...plain, width: 10, height: 20 }), { url: plain.url, width: 10, height: 20 });
});

test("MediaImage renders a plain <img> with no client code", () => {
  const html = renderToStaticMarkup(React.createElement(MediaImage, { media: signed, alt: "封面", displayWidth: 180, className: "x" }));
  assert.match(html, /^<img /);
  assert.match(html, /srcSet|srcset/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /data-neton-media="file_a"/);
  assert.match(html, /alt="封面"/);
  assert.doesNotMatch(html, /<script/);
});

test("the refresh script is a self-contained capture-phase error handler", () => {
  assert.ok(MEDIA_REFRESH_SCRIPT.startsWith("(function(){"));
  assert.ok(MEDIA_REFRESH_SCRIPT.includes(JSON.stringify(MEDIA_REFRESH_ENDPOINT)));
  assert.ok(MEDIA_REFRESH_SCRIPT.includes("},true)"), "listens in the capture phase (error does not bubble)");
  assert.ok(!MEDIA_REFRESH_SCRIPT.includes("</script"), "cannot close its own script tag");
  assert.doesNotThrow(() => new Function(MEDIA_REFRESH_SCRIPT), "is valid JavaScript");
});

test("the refresh script retries each image once and swaps in the fresh address", async () => {
  type Listener = (e: { target: unknown }) => void;
  let listener: Listener | undefined;
  const calls: string[] = [];
  const attrs = new Map<string, string>([["data-neton-media", "file_a"], ["data-neton-variant", "w720"], ["srcset", "old 720w"], ["sizes", "100vw"]]);
  const img = {
    tagName: "IMG",
    src: "old",
    getAttribute: (n: string) => attrs.get(n) ?? null,
    hasAttribute: (n: string) => attrs.has(n),
    setAttribute: (n: string, v: string) => attrs.set(n, v),
    removeAttribute: (n: string) => attrs.delete(n),
  };
  const document = { addEventListener: (_: string, fn: Listener, capture: boolean) => { assert.equal(capture, true); listener = fn; } };
  const fetch = async (url: string) => { calls.push(url); return { ok: true, json: async () => ({ code: 0, data: { url: "fresh" } }) }; };
  new Function("document", "fetch", MEDIA_REFRESH_SCRIPT)(document, fetch);
  listener!({ target: img });
  listener!({ target: img });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(calls, [`${MEDIA_REFRESH_ENDPOINT}file_a?variant=w720`]);
  assert.equal(img.src, "fresh");
  assert.equal(attrs.has("srcset"), false);
  assert.equal(attrs.has("sizes"), false);
});

test("relative backend addresses (CDN strategy none) go through the portal's backend proxy", () => {
  const relay: PublicMedia = { fileId: "file_r", url: "/app/infra/file/get/file_r?exp=1&sig=ab", width: 800, height: 600 };
  const attrs = mediaImageAttributes({ media: relay, alt: "" }, defaultMediaLoader);
  assert.equal(attrs.src, "/api/backend/app/infra/file/get/file_r?exp=1&sig=ab");
  assert.equal(shareImageUrl(relay).url, "/api/backend/app/infra/file/get/file_r?exp=1&sig=ab");
  const withVariants: PublicMedia = { fileId: "file_v", url: "/app/x", variants: { w180: "/app/x?w=180", w360: "https://cdn.example.com/x?w=360" } };
  const v = mediaImageAttributes({ media: withVariants, alt: "", displayWidth: 180 }, defaultMediaLoader);
  assert.equal(v.srcSet, "/api/backend/app/x?w=180 180w, https://cdn.example.com/x?w=360 360w");
  assert.equal(mediaImageAttributes({ media: plain, alt: "" }, defaultMediaLoader).src, plain.url, "absolute addresses are untouched");
});

test("the refresh script routes a relative fresh address through the backend proxy", async () => {
  type Listener = (e: { target: unknown }) => void;
  let listener: Listener | undefined;
  const attrs = new Map<string, string>([["data-neton-media", "file_r"]]);
  const img = { tagName: "IMG", src: "old", getAttribute: (n: string) => attrs.get(n) ?? null, hasAttribute: (n: string) => attrs.has(n), setAttribute: (n: string, v: string) => attrs.set(n, v), removeAttribute: (n: string) => attrs.delete(n) };
  const document = { addEventListener: (_: string, fn: Listener) => { listener = fn; } };
  const fetch = async () => ({ ok: true, json: async () => ({ code: 0, data: { url: "/app/infra/file/get/file_r?exp=2&sig=cd" } }) });
  new Function("document", "fetch", MEDIA_REFRESH_SCRIPT)(document, fetch);
  listener!({ target: img });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(img.src, "/api/backend/app/infra/file/get/file_r?exp=2&sig=cd");
});
