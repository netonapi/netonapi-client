import { connection } from "next/server";
import { sitemapIndexResponse } from "@/site/feeds";

/**
 * sitemap 索引（public-routes §11.2）：列出所有贡献的全部分片与 news sitemap。
 *
 * `connection()`：按请求生成（内容本身是 `"use cache"` 单元，照样缓存），构建期不预渲染——
 * 分片清单来自后端，构建机不连后端（§1a）。
 */
export async function GET() {
  await connection();
  return sitemapIndexResponse();
}
