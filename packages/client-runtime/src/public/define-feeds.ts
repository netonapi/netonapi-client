/**
 * sitemap 与 RSS 贡献的入口定义（public-routes §11.2–11.3）。地址可以写站内路径，底座拼站点 origin。
 */
import type { PublicBackend } from "../public-server/backend";
import type { ServerTranslate } from "../public-server/i18n";
import type { PublicSiteInfo } from "./define";
import type { FeedItem, NewsUrl, SitemapUrl } from "./xml";

export interface FeedContext {
  site: PublicSiteInfo;
  backend: PublicBackend;
  t: ServerTranslate;
  href(routeKey: string, params?: Record<string, string | number>): string | null;
}

/** 分片 / 贡献 id：小写字母、数字、`-`（文件名 `/sitemaps/{贡献 id}.{分片 id}.xml`）。 */
export const SITEMAP_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface SitemapShard {
  id: string;
  lastmod?: number | string;
  /** 历史分片（如往月）内容不再变化：按 static 档缓存 */
  immutable?: boolean;
}

export interface SitemapDefinition {
  /** 分片要稳定：已有分片的 id 不随新内容变化。 */
  shards(ctx: FeedContext): Promise<SitemapShard[]>;
  /** 一个分片的地址（≤ 50 000 条）与缓存标签（§8.3，通常是 `feed:{type}` 与节点标签）。 */
  urls(shardId: string, ctx: FeedContext): Promise<{ urls: SitemapUrl[]; tags?: string[] } | null>;
  /** 近 48 小时的新闻（≤ 1000 条）；只有 manifest 里 `news: true` 的贡献才会被调用。 */
  news?(ctx: FeedContext): Promise<{ urls: NewsUrl[]; tags?: string[] }>;
}

export function defineSitemap(definition: SitemapDefinition): SitemapDefinition {
  return definition;
}

export interface FeedDefinition {
  /** 返回 null = 该地址的 feed 不存在（404）。 */
  load(ctx: FeedContext & { params: Record<string, string> }): Promise<{ title: string; description: string; link: string; items: FeedItem[]; tags?: string[] } | null>;
}

export function defineFeed(definition: FeedDefinition): FeedDefinition {
  return definition;
}
