import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeXml, newsSitemapXml, robotsTxt, rssXml, sitemapIndexXml, sitemapUrlsetXml, SITEMAP_MAX_URLS, w3cDate } from "../xml";

test("escapeXml escapes markup and drops characters XML 1.0 forbids", () => {
  assert.equal(escapeXml(`<a href="x">&'\u0000\u0008</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;");
});

test("dates are W3C UTC with second precision; seconds and milliseconds are both accepted", () => {
  assert.equal(w3cDate(1792600503398), "2026-10-21T16:35:03Z");
  assert.equal(w3cDate(1792600503), "2026-10-21T16:35:03Z");
  assert.equal(w3cDate("garbage"), undefined);
});

test("sitemap index, urlset with images, truncation", () => {
  assert.match(sitemapIndexXml([{ loc: "https://e/sitemaps/a.all.xml" }]), /<sitemap><loc>https:\/\/e\/sitemaps\/a\.all\.xml<\/loc><\/sitemap>/);
  const { xml } = sitemapUrlsetXml([{ loc: "https://e/a?x=1&y=2", images: [{ loc: "https://e/i.png" }] }]);
  assert.match(xml, /xmlns:image=/);
  assert.match(xml, /a\?x=1&amp;y=2/);
  const big = sitemapUrlsetXml(Array.from({ length: SITEMAP_MAX_URLS + 1 }, (_, i) => ({ loc: `https://e/${i}` })));
  assert.equal(big.truncated, true);
  assert.equal((big.xml.match(/<url>/g) ?? []).length, SITEMAP_MAX_URLS);
});

test("news sitemap and RSS", () => {
  assert.match(newsSitemapXml([{ loc: "https://e/a", title: "T & U", publishedAt: 1792600503398, language: "" }], { name: "E", language: "zh" }), /<news:language>zh<\/news:language>.*<news:title>T &amp; U<\/news:title>/);
  const rss = rssXml({ title: "E", link: "https://e/", selfLink: "https://e/rss.xml", description: "d", language: "zh-CN", items: [{ title: "a", link: "https://e/a", publishedAt: 1792600503398 }] });
  assert.match(rss, /<atom:link href="https:\/\/e\/rss.xml" rel="self"/);
  assert.match(rss, /<guid isPermaLink="true">https:\/\/e\/a<\/guid><pubDate>Wed, 21 Oct 2026 16:35:03 GMT<\/pubDate>/);
});

test("robots.txt lists disallows and the sitemap index, or blocks everything", () => {
  assert.equal(robotsTxt({ origin: "https://e", disallow: ["/my/", "/api/", "/my/"] }), "User-agent: *\nAllow: /\nDisallow: /my/\nDisallow: /api/\n\nSitemap: https://e/sitemap.xml\n");
  assert.equal(robotsTxt({ origin: "https://e", disallow: ["/"] }), "User-agent: *\nDisallow: /\n");
});
