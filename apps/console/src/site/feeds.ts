import { cacheProfile } from "@neton/application-client-runtime/public";
import { cacheLife, cacheTag } from "next/cache";
import {
  absoluteUrl,
  cacheControlFor,
  newsSitemapXml,
  normalizeTags,
  rssXml,
  SITE_FEED_ITEMS,
  sitemapIndexXml,
  sitemapUrlsetXml,
  validateParams,
  type FeedContext,
  type FeedDefinition,
  type FeedItem,
} from "@neton/application-client-runtime/public";
import type { PublicParamRule } from "@neton/application-client-contract";
import { buildPath } from "@neton/application-client-runtime/public";
import { createPublicBackend } from "@neton/application-client-runtime/public-server";
import { routePatterns, sitemapRegistry, siteFeedRegistry } from "@/generated/public.generated";
import { site } from "@/generated/site.generated";
import { getSiteBrand } from "@/lib/site-brand";
import { serverI18n } from "./server-i18n";

/**
 * sitemap 与 RSS 的生成（public-routes §11）。XML 规则在运行时包（xml.ts），这里接上注册表与缓存：
 * 每份 XML 是一个 `"use cache"` 单元，打贡献方给出的标签，按 `list` 档（历史分片 `static` 档）缓存。
 */

async function feedContext(namespace: string): Promise<FeedContext> {
  const [brand, t] = await Promise.all([getSiteBrand(), serverI18n.getServerT(namespace, site.locale)]);
  return {
    site: { origin: site.origin, name: brand.name, consoleBasePath: site.consoleBasePath, locale: site.locale, timeZone: site.timeZone },
    backend: createPublicBackend(),
    t,
    href: (key, params = {}) => (routePatterns[key] ? buildPath(routePatterns[key]!, params) : null),
  };
}

function xmlResponse(xml: string, profile: "list" | "static", contentType = "application/xml; charset=utf-8"): Response {
  return new Response(xml, { headers: { "Content-Type": contentType, "Cache-Control": cacheControlFor(profile) } });
}

const notFound = () => new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": cacheControlFor("list") } });

export async function sitemapIndexBody(): Promise<string> {
  "use cache";
  cacheLife(cacheProfile("list"));
  const entries: { loc: string; lastmod?: number | string }[] = [];
  for (const contribution of sitemapRegistry) {
    const shards = await contribution.definition.shards(await feedContext(contribution.namespace));
    for (const shard of shards) entries.push({ loc: `${site.origin}/sitemaps/${contribution.id}.${shard.id}.xml`, lastmod: shard.lastmod });
  }
  if (sitemapRegistry.some((s) => s.news)) entries.push({ loc: `${site.origin}/sitemaps/news.xml` });
  return sitemapIndexXml(entries);
}

export async function sitemapIndexResponse(): Promise<Response> {
  return xmlResponse(await sitemapIndexBody(), "list");
}

/** 一个分片；不存在返回 null（→ 404）。 */
export async function sitemapShardBody(contributionId: string, shardId: string): Promise<string | null> {
  "use cache";
  const contribution = sitemapRegistry.find((s) => s.id === contributionId);
  if (!contribution) { cacheLife(cacheProfile("list")); return null; }
  const ctx = await feedContext(contribution.namespace);
  const shard = (await contribution.definition.shards(ctx)).find((s) => s.id === shardId);
  if (!shard) { cacheLife(cacheProfile("list")); return null; }
  cacheLife(cacheProfile(shard.immutable ? "static" : "list"));
  const result = await contribution.definition.urls(shardId, ctx);
  if (!result) return null;
  const tags = normalizeTags(result.tags ?? []);
  if (tags.length) cacheTag(...tags);
  const { xml, truncated } = sitemapUrlsetXml(result.urls.map((u) => ({ ...u, loc: absoluteUrl(site.origin, u.loc) })));
  if (truncated) console.error(`[site] sitemap ${contributionId}.${shardId} exceeds 50 000 URLs / 50 MB and was truncated`);
  return xml;
}

export async function newsSitemapBody(): Promise<string | null> {
  "use cache";
  cacheLife(cacheProfile("list"));
  const contributions = sitemapRegistry.filter((s) => s.news && s.definition.news);
  if (!contributions.length) return null;
  const urls = [];
  for (const c of contributions) {
    const result = await c.definition.news!(await feedContext(c.namespace));
    const tags = normalizeTags(result.tags ?? []);
    if (tags.length) cacheTag(...tags);
    urls.push(...result.urls.map((u) => ({ ...u, loc: absoluteUrl(site.origin, u.loc) })));
  }
  const brand = await getSiteBrand();
  return newsSitemapXml(urls, { name: brand.name, language: site.locale.split("-")[0]!.toLowerCase() });
}

export async function sitemapFileResponse(file: string): Promise<Response> {
  if (file === "news.xml") {
    const xml = await newsSitemapBody();
    return xml ? xmlResponse(xml, "list") : notFound();
  }
  const match = /^([a-z0-9][a-z0-9-]{0,63})\.([a-z0-9][a-z0-9-]{0,63})\.xml$/.exec(file);
  if (!match) return notFound();
  const xml = await sitemapShardBody(match[1]!, match[2]!);
  return xml ? xmlResponse(xml, "list") : notFound();
}

/** 站点 feed（/rss.xml）：聚合所有 `site: true` 的贡献，按时间合并，前 50 条。 */
export async function siteFeedBody(): Promise<string | null> {
  "use cache";
  cacheLife(cacheProfile("list"));
  if (!siteFeedRegistry.length || !site.feeds.site) return null;
  const items: FeedItem[] = [];
  for (const contribution of siteFeedRegistry) {
    const result = await contribution.definition.load({ ...(await feedContext(contribution.namespace)), params: {} });
    if (!result) continue;
    const tags = normalizeTags(result.tags ?? []);
    if (tags.length) cacheTag(...tags);
    items.push(...result.items.map((i) => ({ ...i, link: absoluteUrl(site.origin, i.link) })));
  }
  const ms = (v: number | string) => (typeof v === "number" ? (v < 10_000_000_000 ? v * 1000 : v) : Date.parse(v));
  items.sort((a, b) => ms(b.publishedAt) - ms(a.publishedAt));
  const [brand, t] = await Promise.all([getSiteBrand(), serverI18n.getServerT("site", site.locale)]);
  return rssXml({
    title: t(site.feeds.site.title),
    link: `${site.origin}/`,
    selfLink: `${site.origin}/rss.xml`,
    description: brand.tagline || brand.name,
    language: site.locale,
    items: items.slice(0, SITE_FEED_ITEMS),
  });
}

export async function siteFeedResponse(): Promise<Response> {
  const xml = await siteFeedBody();
  return xml ? xmlResponse(xml, "list", "application/rss+xml; charset=utf-8") : notFound();
}

/** 生成的模块 feed 路由文件写进去的静态描述（显式标注类型：参数规则是字面量联合，不能被推断宽化成 string）。 */
export interface FeedRouteMeta { id: string; namespace: string; pattern: string; params: Record<string, PublicParamRule> }

/** 模块 feed（生成的路由文件在自己的 `"use cache"` 函数里调它）。 */
export async function renderFeed(feed: FeedDefinition, meta: FeedRouteMeta, rawParams: Record<string, string>): Promise<string | null> {
  cacheLife(cacheProfile("list"));
  const params = validateParams(rawParams, meta.params);
  if (!params) return null;
  const result = await feed.load({ ...(await feedContext(meta.namespace)), params });
  if (!result) return null;
  const tags = normalizeTags(result.tags ?? []);
  if (tags.length) cacheTag(...tags);
  return rssXml({
    title: result.title,
    link: absoluteUrl(site.origin, result.link),
    selfLink: `${site.origin}${buildPath(meta.pattern, params)}`,
    description: result.description,
    language: site.locale,
    items: result.items.slice(0, SITE_FEED_ITEMS).map((i) => ({ ...i, link: absoluteUrl(site.origin, i.link) })),
  });
}

export async function feedResponse(params: Record<string, string>, body: (params: Record<string, string>) => Promise<string | null>): Promise<Response> {
  const xml = await body(params);
  return xml ? xmlResponse(xml, "list", "application/rss+xml; charset=utf-8") : notFound();
}
