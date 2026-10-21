import assert from "node:assert/strict";
import { test } from "node:test";
import { jsonLd, resolveCanonical, resolveRobots, serializeJsonLd, toNextMetadata, truncateGraphemes, type SeoContext } from "../seo";

const ctx: SeoContext = { origin: "https://www.example.com", siteName: "Example", locale: "zh-CN", path: "/channel/latest", query: "cursor=abc", indexable: true };

test("canonical defaults to the current path plus whitelisted query and always uses the site origin", () => {
  assert.equal(resolveCanonical(undefined, ctx), "https://www.example.com/channel/latest?cursor=abc");
  assert.equal(resolveCanonical("/article/1?utm=x#a", ctx), "https://www.example.com/article/1");
  assert.equal(resolveCanonical("https://www.example.com/article/1", ctx), "https://www.example.com/article/1");
  assert.equal(resolveCanonical("https://origin.example.org/post/9", ctx), "https://origin.example.org/post/9", "an editor's cross-site canonical is kept");
});

test("robots can only be tightened", () => {
  assert.deepEqual(resolveRobots(undefined, true), { index: true, follow: true, maxImagePreview: "large" });
  assert.equal(resolveRobots({ index: true }, false).index, false);
  assert.equal(resolveRobots({ index: false }, true).index, false);
});

test("descriptions are cut by grapheme, not by UTF-16 unit", () => {
  const text = `${"汉".repeat(159)}👨‍👩‍👧更多`;
  const cut = truncateGraphemes(text, 160);
  assert.equal([...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(cut)].length, 160);
  assert.ok(cut.endsWith("…"));
  assert.equal(truncateGraphemes("  a \n b  ", 160), "a b");
});

test("metadata carries canonical, OG, Twitter and verification", () => {
  const meta = toNextMetadata(
    { title: "Latest", description: "News", openGraph: { type: "article", images: [{ url: "/og.png", width: 1200, height: 675 }], article: { publishedTime: "2026-10-01T00:00:00Z" } } },
    { ...ctx, verification: { google: "g", baidu: "b", bing: "m" }, siteFeed: { title: "Feed", href: "/rss.xml" } },
  );
  assert.equal(meta.alternates?.canonical, "https://www.example.com/channel/latest?cursor=abc");
  assert.deepEqual((meta.openGraph as { images: { url: string }[] }).images[0]!.url, "https://www.example.com/og.png");
  assert.equal((meta.twitter as { card: string }).card, "summary_large_image");
  assert.deepEqual(meta.verification, { google: "g", other: { "baidu-site-verification": "b", "msvalidate.01": "m" } });
  assert.deepEqual((meta.alternates?.types as Record<string, unknown>)["application/rss+xml"], [{ url: "https://www.example.com/rss.xml", title: "Feed" }]);
  assert.deepEqual(meta.robots, { index: true, follow: true, "max-image-preview": "large" });
});

test("JSON-LD cannot close the script element", () => {
  const out = serializeJsonLd({ headline: "</script><script>alert(1)</script> &  " });
  assert.equal(out.includes("</script"), false);
  assert.equal(out.includes("&"), false);
  assert.deepEqual(JSON.parse(out), { headline: "</script><script>alert(1)</script> &  " });
});

test("article builder truncates headlines and omits absent fields", () => {
  const a = jsonLd.article({ headline: "x".repeat(200), url: "https://e/a", datePublished: "2026-10-01T00:00:00Z", publisher: { name: "E" } });
  assert.equal((a.headline as string).length, 110);
  assert.equal("dateModified" in a, false);
  assert.equal("image" in a, false);
});

test("article builder covers the NewsArticle field table", () => {
  const a = jsonLd.article({
    headline: "标题",
    url: "https://www.example.com/article/1",
    datePublished: "2026-10-01T08:00:00+08:00",
    dateModified: "2026-10-02T08:00:00+08:00",
    description: "摘要",
    images: ["https://cdn/a.jpg", { url: "https://cdn/b.jpg", width: 1200, height: 675 }],
    author: { name: "作者", url: "https://www.example.com/author/9" },
    publisher: { name: "站点", logo: "https://www.example.com/logo.png" },
    section: "手机",
    keywords: ["5G", "芯片"],
    commentCount: 12,
    isAccessibleForFree: false,
    basedOn: { url: "https://source.example/x", publisherName: "来源" },
  }) as Record<string, any>;
  assert.equal(a["@type"], "NewsArticle");
  assert.equal(a.mainEntityOfPage, "https://www.example.com/article/1");
  assert.equal(a.dateModified, "2026-10-02T08:00:00+08:00");
  assert.equal(a.description, "摘要");
  assert.deepEqual(a.image, ["https://cdn/a.jpg", { "@type": "ImageObject", url: "https://cdn/b.jpg", width: 1200, height: 675 }]);
  assert.deepEqual(a.author, { "@type": "Person", name: "作者", url: "https://www.example.com/author/9" });
  assert.deepEqual(a.publisher, { "@type": "Organization", name: "站点", logo: { "@type": "ImageObject", url: "https://www.example.com/logo.png" } });
  assert.equal(a.articleSection, "手机");
  assert.equal(a.keywords, "5G,芯片");
  assert.equal(a.commentCount, 12);
  assert.equal(a.isAccessibleForFree, false);
  assert.deepEqual(a.isBasedOn, { "@type": "CreativeWork", url: "https://source.example/x", publisher: { "@type": "Organization", name: "来源" } });
});

test("article headlines are truncated by grapheme, never splitting a character", () => {
  const a = jsonLd.article({ headline: "👍🏽".repeat(120), url: "u", datePublished: "d", publisher: { name: "E" } }) as Record<string, string>;
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(a.headline)];
  assert.equal(graphemes.length, 110);
  assert.equal(graphemes.at(-1)!.segment, "…");
  assert.ok(graphemes.slice(0, -1).every((g) => g.segment === "👍🏽"));
  const b = jsonLd.article({ headline: "t", url: "u", datePublished: "d", publisher: { name: "E" } }) as Record<string, unknown>;
  assert.equal("dateModified" in b, false, "dateModified is omitted, never faked with the row's updatedAt");
  assert.equal("author" in b, false);
});
