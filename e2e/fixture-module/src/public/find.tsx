import { definePublicRoute } from "@neton/application-client-runtime/public";
import type { FixturePage } from "../data";

interface FindData { q: string; page: FixturePage | null }

/** `/find?q=`：dynamic 档（不缓存、恒 200、noindex），取数带客户端转发头。 */
export default definePublicRoute<FindData>({
  async load(ctx) {
    const q = (ctx.query.q ?? "").trim().slice(0, 100);
    if (!q) return { kind: "ok", data: { q, page: null } };
    return { kind: "ok", data: { q, page: await ctx.backend.get<FixturePage>("/app/fixture/search", { q }) } };
  },
  seo(_data, ctx) {
    return { title: ctx.t("find.title") };
  },
  Page({ data, ctx }) {
    return (
      <section data-testid="find" data-q={data.q}>
        <h1>{ctx.t("find.title")}</h1>
        {data.page && ctx.renderCards(data.page.list)}
      </section>
    );
  },
});
