import { defineSitemap, feedTag } from "@neton/application-client-runtime/public";
import { ITEM, loadPage } from "../data";

/** 夹具的 sitemap：一个分片 `all`（前 50 条已发布条目）与 news（同一批）。 */
export default defineSitemap({
  async shards() {
    return [{ id: "all" }];
  },
  async urls(shardId, ctx) {
    if (shardId !== "all") return null;
    const page = await loadPage(ctx.backend, { limit: 50 });
    return { urls: page.list.map((c) => ({ loc: `/item/${c.ref.id}` })), tags: [feedTag(ITEM)] };
  },
  async news(ctx) {
    const page = await loadPage(ctx.backend, { limit: 50 });
    return {
      urls: page.list.map((c) => ({ loc: `/item/${c.ref.id}`, title: (c.view as { title: string }).title, publishedAt: (c.view as { publishedAt: string }).publishedAt, language: "zh" })),
      tags: [feedTag(ITEM)],
    };
  },
});
