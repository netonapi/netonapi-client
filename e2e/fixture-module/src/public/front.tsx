import { definePublicRoute, jsonLd } from "@neton/application-client-runtime/public";
import { listTags, loadPage, type FixturePage } from "../data";

/** `/`：无路径参数的列表页（只有查询变体，proxy 把裸地址改写到 `~q/-`）。 */
export default definePublicRoute<FixturePage>({
  async load(ctx) {
    const page = await loadPage(ctx.backend, { limit: 5 });
    return { kind: "ok", data: page, tags: listTags(page) };
  },
  seo(_page, ctx) {
    return {
      title: ctx.t("front.title", { name: ctx.site.name }),
      titleAbsolute: true,
      description: ctx.t("front.description"),
      jsonLd: [jsonLd.webSite({ name: ctx.site.name, url: `${ctx.site.origin}/`, inLanguage: ctx.locale }), jsonLd.organization({ name: ctx.site.name, url: `${ctx.site.origin}/` })],
    };
  },
  Page({ data, ctx }) {
    return (
      <section data-testid="front">
        <h1>{ctx.t("front.title", { name: ctx.site.name })}</h1>
        {ctx.renderCards(data.list, { eagerImages: 1 })}
      </section>
    );
  },
});
