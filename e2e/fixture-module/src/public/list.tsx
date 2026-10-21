import { definePublicRoute, jsonLd, MediaImage, type PublicMedia } from "@neton/application-client-runtime/public";
import { listTags, loadPage, type FixturePage } from "../data";

interface ListData { page: FixturePage; cursor: string | null; sort: string | null }

/** `/list?cursor=&sort=`：无路径参数、带查询白名单的列表页；带游标的页 noindex、canonical 指向自己。 */
export default definePublicRoute<ListData>({
  async load(ctx) {
    const cursor = ctx.query.cursor ?? null;
    const sort = ctx.query.sort ?? null;
    if (sort !== null && sort !== "old") return { kind: "not_found" };
    const page = await loadPage(ctx.backend, { cursor: cursor ?? undefined, sort: sort ?? undefined, limit: 3 });
    return { kind: "ok", data: { page, cursor, sort }, tags: listTags(page) };
  },
  seo({ page, cursor }, ctx) {
    const next = page.nextCursor ? `/list?cursor=${encodeURIComponent(page.nextCursor)}` : undefined;
    return {
      title: ctx.t("list.title"),
      robots: cursor ? { index: false, follow: true } : undefined,
      pagination: next ? { next } : undefined,
      jsonLd: [jsonLd.collectionPage({ name: ctx.t("list.title"), url: `${ctx.site.origin}/list` })],
    };
  },
  Page({ data, ctx }) {
    // 第一页：焦点图（第一张卡片的封面）是 LCP 图；卡片流也开了 priorityFirst——同一次渲染里第二张 priority
    // 图必须降级为 eager（public-routes §10.4），端到端测试断言整页只有一张高优先级图
    const hero = data.cursor ? null : ((data.page.list[0]?.view as { cover?: PublicMedia | null } | undefined)?.cover ?? null);
    return (
      <section data-testid="list" data-cursor={data.cursor ?? ""} data-sort={data.sort ?? ""}>
        <h1>{ctx.t("list.title")}</h1>
        {hero && <MediaImage media={hero} alt="" displayWidth={720} aspect="16:9" priority />}
        {ctx.renderCards(data.page.list, { eagerImages: data.cursor ? 0 : 2, priorityFirst: !data.cursor })}
        {data.page.nextCursor && <a rel="next" href={`/list?cursor=${encodeURIComponent(data.page.nextCursor)}`}>{ctx.t("list.next")}</a>}
      </section>
    );
  },
});
