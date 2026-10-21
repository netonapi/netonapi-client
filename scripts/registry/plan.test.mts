import assert from "node:assert/strict";
import { test } from "node:test";
import type { FrontModuleManifest, SiteConfig } from "@neton/application-client-contract";
import { resolveSite } from "@neton/application-client-runtime/public";
import { plan, routeDir, type PlanInput } from "./plan.mts";

const portal: SiteConfig = { origin: "https://www.example.com", consoleBasePath: "/my", locales: { default: "zh-CN", supported: ["zh-CN"], prefix: "none" } };

const filter: FrontModuleManifest = {
  id: "filter",
  contractVersion: "1.1.0",
  pages: [],
  locales: [{ lang: "zh-CN", entry: "zh-CN" }],
  publicRoutes: [{ key: "filter.channel", pattern: "/channel/:code", params: { code: "code" }, query: ["cursor"], entry: "channel", cache: "list", indexable: true, goneAware: true, instantiable: true }],
  sitemaps: [{ id: "filter", entry: "channels" }],
};

function input(overrides: Partial<PlanInput> & { site?: SiteConfig; modules?: PlanInput["modules"] } = {}): PlanInput {
  return {
    modules: overrides.modules ?? [{ pkg: "@neton/application-client-filter", manifest: filter }],
    site: resolveSite(overrides.site ?? portal),
    sitePageEntries: overrides.sitePageEntries ?? [],
    previousRoutes: overrides.previousRoutes ?? null,
    resolvable: overrides.resolvable ?? (() => true),
    goneTexts: { title: "Gone", body: "Removed for good.", home: "Home" },
  };
}

test("routeDir maps patterns to App Router folders", () => {
  assert.equal(routeDir("/"), "");
  assert.equal(routeDir("/archive/:y/:m"), "archive/[y]/[m]");
});

test("a module route generates a plain and a query-variant route file with a sentinel prerender", () => {
  const out = plan(input());
  assert.deepEqual(out.errors, []);
  const page = out.files["src/app/(public)/(modules)/channel/[code]/page.tsx"]!;
  assert.match(page, /import route from "@neton\/application-client-filter\/public\/channel";/);
  assert.match(page, /"use cache";/);
  assert.match(page, /export const ensureStatic = "navigation";/);
  assert.match(page, /return \[\{"code":"-"\}\];/);
  const variant = out.files["src/app/(public)/(modules)/channel/[code]/~q/[_q]/page.tsx"]!;
  assert.match(variant, /return \[\{"code":"-","_q":"_"\}\];/);
  assert.deepEqual(out.routesJson, { "filter.channel": "/channel/:code" });
  assert.match(out.files["src/generated/public-proxy.generated.ts"]!, /"goneAware": true/);
  assert.match(out.files["src/generated/public-proxy.generated.ts"]!, /<meta name=\\"robots\\" content=\\"noindex\\">/);
  assert.ok(out.files["src/app/(console)/my/layout.tsx"]!.includes("export const instant = false;"));
});

test("console-only products keep the console at the root", () => {
  const out = plan(input({ modules: [], site: { ...portal, consoleBasePath: "/" } }));
  assert.deepEqual(out.errors, []);
  assert.ok(out.files["src/app/(console)/layout.tsx"]);
  assert.ok(out.files["src/app/(console)/[...slug]/page.tsx"]);
  assert.match(out.files["src/generated/public.generated.tsx"]!, /robotsDisallowPaths: string\[\] = \["\/"\]/);
});

test("public routes require a console prefix", () => {
  const out = plan(input({ site: { ...portal, consoleBasePath: "/" } }));
  assert.ok(out.errors.some((e) => /consoleBasePath must not be "\/"/.test(e)));
});

test("overrides keep parameter names; instances need instantiable routes; reserved prefixes are protected", () => {
  assert.ok(plan(input({ site: { ...portal, routes: { override: { "filter.channel": "/c/:slug" } } } })).errors.some((e) => /must keep the parameter names/.test(e)));
  const ok = plan(input({ site: { ...portal, routes: { override: { "filter.channel": "/c/:code" }, instances: [{ key: "filter.channel@hot", of: "filter.channel", pattern: "/hot/:code", fixed: { kind: "hot" } }] } } }));
  assert.deepEqual(ok.errors, []);
  assert.match(ok.files["src/app/(public)/(modules)/hot/[code]/page.tsx"]!, /"fixed":\{"kind":"hot"\}/);
  assert.ok(plan(input({ site: { ...portal, routes: { override: { "filter.channel": "/my/:code" } } } })).errors.some((e) => /reserved prefix \/my/.test(e)));
});

test("conflicting shapes between modules and fork pages fail the build", () => {
  const out = plan(input({ site: { ...portal, pages: [{ key: "site.channel", pattern: "/channel/:slug", params: { slug: "slug" }, entry: "channel", cache: "list", indexable: true }] }, sitePageEntries: ["channel"] }));
  assert.ok(out.errors.some((e) => /match the same URLs/.test(e)));
});

test("fork pages are generated into the (site) group and must exist", () => {
  const home = { key: "site.home", pattern: "/", entry: "home", cache: "list" as const, indexable: true };
  const out = plan(input({ site: { ...portal, pages: [home] }, sitePageEntries: ["home"] }));
  assert.deepEqual(out.errors, []);
  // 无参数页面只有查询变体（proxy 把 `/` 改写到 `/~q/-`）：构建期只预渲染哨兵，不连后端
  assert.equal(out.files["src/app/(public)/(site)/page.tsx"], undefined);
  const variant = out.files["src/app/(public)/(site)/~q/[_q]/page.tsx"]!;
  assert.match(variant, /import route from "@\/site\/pages\/home";/);
  assert.match(variant, /export const ensureStatic = "navigation";/);
  assert.match(variant, /return \[\{"_q":"_"\}\];/);
  assert.match(out.files["src/generated/public-proxy.generated.ts"]!, /"key": "site.home",[^}]*"queryOnly": true/);
  assert.ok(plan(input({ site: { ...portal, pages: [home] } })).errors.some((e) => /src\/site\/pages\/home.tsx does not exist/.test(e)));
});

test("URL shape regressions need a legacy declaration", () => {
  const moved = { ...portal, routes: { override: { "filter.channel": "/c/:code" } } };
  const failing = plan(input({ site: moved, previousRoutes: { "filter.channel": "/channel/:code" } }));
  assert.ok(failing.errors.some((e) => /moved from \/channel\/:code to \/c\/:code/.test(e)));
  const passing = plan(input({ site: { ...moved, routes: { ...moved.routes, legacy: { "filter.channel": ["/channel/:code"] } } }, previousRoutes: { "filter.channel": "/channel/:code" } }));
  assert.deepEqual(passing.errors, []);
  assert.match(passing.files["src/generated/public-proxy.generated.ts"]!, /"from": "\/channel\/:code",\s*"to": "\/c\/:code"/);
  const removed = plan(input({ modules: [], previousRoutes: { "filter.channel": "/channel/:code" } }));
  assert.ok(removed.errors.some((e) => /disappeared/.test(e)));
  assert.deepEqual(plan(input({ modules: [], site: { ...portal, routes: { disable: ["filter.channel"] } }, previousRoutes: { "filter.channel": "/channel/:code" } })).errors, []);
});

test("contract versions: 1.1 fields need 1.1, newer minors are refused", () => {
  const old = plan(input({ modules: [{ pkg: "p", manifest: { ...filter, contractVersion: "1.0.0" } }] }));
  assert.ok(old.errors.some((e) => /uses contract 1.1 fields/.test(e)));
  const future = plan(input({ modules: [{ pkg: "p", manifest: { ...filter, contractVersion: "1.2.0" } }] }));
  assert.ok(future.errors.some((e) => /not compatible/.test(e)));
});

test("route rules: every parameter has a rule, dynamic routes are noindex, entries resolve, slot targets exist", () => {
  const bad: FrontModuleManifest = {
    ...filter,
    publicRoutes: [
      { key: "filter.a", pattern: "/a/:x", entry: "a", cache: "list", indexable: true },
      { key: "filter.search", pattern: "/search", query: ["q"], entry: "s", cache: "dynamic", indexable: true },
      { key: "wrong.prefix", pattern: "/b", entry: "b", cache: "list", indexable: true },
    ],
    slots: [{ target: "public.nowhere", id: "filter.s", entry: "s", rendering: "server" }],
  };
  const out = plan(input({ modules: [{ pkg: "p", manifest: bad }], resolvable: (s) => !s.endsWith("/public/a") }));
  for (const re of [/":x" has no rule/, /must not be indexable/, /"wrong.prefix" must be "<module id>.<name>"/, /does not resolve/, /undeclared slot "public.nowhere"/]) {
    assert.ok(out.errors.some((e) => re.test(e)), String(re));
  }
});

test("module feeds get their own route handler", () => {
  const withFeed: FrontModuleManifest = { ...filter, feeds: [{ id: "filter.channel", pattern: "/channel/:code/rss.xml", params: { code: "code" }, entry: "channel" }] };
  const out = plan(input({ modules: [{ pkg: "p", manifest: withFeed }] }));
  assert.deepEqual(out.errors, []);
  const route = out.files["src/app/(public)/(modules)/channel/[code]/rss.xml/route.ts"]!;
  assert.match(route, /"use cache";/);
  // 参数规则是字面量联合：META 显式标注类型，否则 {"code":"code"} 被推断成 string，生成文件过不了类型检查
  assert.match(route, /const META: FeedRouteMeta = \{/);
  assert.match(route, /await connection\(\);/);
  assert.match(route, /\(await context\.params\) \?\? \{\}/);
});
