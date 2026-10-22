import { defineFrontModule } from "@neton/application-client-contract";

/**
 * 端到端测试的夹具模块：覆盖公开路由契约的每一种形状——无参数的列表页（`/`、`/list`：只有查询变体、
 * 按需渲染）、带参数的对象页（goneAware、legacy 308、跳转）、dynamic 档、卡片渲染器、sitemap（含 news）、
 * 站点 feed 与带路径的模块 feed。数据来自 e2e/mock-backend.mts。
 */
export default defineFrontModule({
  id: "fixture",
  contractVersion: "1.1.0",
  locales: [
    { lang: "zh-CN", entry: "zh-CN" },
    { lang: "en-US", entry: "en-US" },
  ],
  pages: [{ key: "fixture/console/index", path: "/fixture", entry: "console", rendering: "client", title: "Fixture" }],
  publicRoutes: [
    { key: "fixture.front", pattern: "/", entry: "front", cache: "list", indexable: true },
    { key: "fixture.item", pattern: "/item/:id", params: { id: "id" }, entry: "item", cache: "object", indexable: true, goneAware: true },
    { key: "fixture.list", pattern: "/list", query: ["cursor", "sort"], entry: "list", cache: "list", indexable: true },
    { key: "fixture.find", pattern: "/find", query: ["q"], entry: "find", cache: "dynamic", indexable: false },
  ],
  slots: [
    { target: "public.object.after", id: "fixture.related", entry: "related", rendering: "server", objectTypes: ["fixture.item"] },
    { target: "public.object.bar", id: "fixture.bar", entry: "bar", rendering: "server", objectTypes: ["fixture.item"] },
    { target: "public.header.actions", id: "fixture.header", entry: "header", rendering: "client" },
    { target: "console.header.actions", id: "fixture.header", entry: "header", rendering: "client" },
    { target: "console.home", id: "fixture.overview", entry: "overview", rendering: "client" },
  ],
  cardRenderers: [{ objectType: "fixture.item", entry: "item" }],
  sitemaps: [{ id: "fixture", entry: "items", news: true }],
  feeds: [
    { id: "fixture.latest", entry: "latest", site: true },
    { id: "fixture.list", pattern: "/list/rss.xml", entry: "latest" },
    // 带路径参数的模块 feed：生成的路由文件必须过 next build 的类型检查
    { id: "fixture.item", pattern: "/item/:id/rss.xml", entry: "latest", params: { id: "id" } },
  ],
});
