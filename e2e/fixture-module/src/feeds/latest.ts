import { defineFeed } from "@neton/application-client-runtime/public";
import { listTags, loadPage } from "../data";

/** 最新条目的 RSS（站点 feed 的贡献，同时挂在 `/list/rss.xml`）。 */
export default defineFeed({
  async load(ctx) {
    const page = await loadPage(ctx.backend, { limit: 20 });
    return {
      title: ctx.t("list.title"),
      description: ctx.t("front.description"),
      link: "/list",
      tags: listTags(page),
      items: page.list.map((c) => {
        const v = c.view as { id: string; title: string; summary: string; publishedAt: string };
        return { title: v.title, link: `/item/${v.id}`, publishedAt: v.publishedAt, description: v.summary };
      }),
    };
  },
});
