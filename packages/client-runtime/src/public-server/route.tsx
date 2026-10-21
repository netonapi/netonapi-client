/**
 * 公开路由的渲染管线（public-routes §4、§7）：生成的路由文件只有几行胶水，规则都在这里。
 *
 * 每条路由生成成真实的 Next 路由文件：
 *
 * ```tsx
 * import route from "<pkg>/public/<entry>";
 * import { publicRuntime } from "@/site/public-runtime";
 * const META = {…};
 * async function load(params, query) { "use cache"; return publicRuntime.runLoad(route, META, params, query); }
 * export const ensureStatic = "navigation";
 * export function generateStaticParams() { return [{ … 必然不合法的参数 … }]; }
 * const page = publicRuntime.createPage(route, META, load);
 * export const generateMetadata = page.generateMetadata;
 * export default page.Page;
 * ```
 *
 * 为什么是这个形状（Next 16 Cache Components 实测）：
 * - `"use cache"` 函数只能闭包住可序列化的值，路由定义里有函数，所以缓存函数必须写在路由文件的模块作用域；
 * - `ensureStatic = "navigation"` 让参数未预渲染的 URL 的第一次请求**等完整页面**，不先发出 App Shell——
 *   否则 200 已经发出，notFound / redirect 只能退化成 noindex 与客户端跳转；
 * - `generateStaticParams` 必须至少返回一组参数：给一组必然不合法的参数，构建期只预渲染出一个 404，
 *   不需要连后端。
 *
 * 主内容不放进 Suspense：取数完成、状态码确定之后才输出字节（§1 决议 5）。
 */
import * as React from "react";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { headers } from "next/headers";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { connection } from "next/server";
import { forwardedClientHeaders } from "../forwarded";
import { cacheProfile, PUBLIC_CACHE_PROFILES, type PublicCacheProfileName } from "../public/cache-profiles";
import type { PublicLoadContext, PublicLoadResult, PublicPageContext, PublicRouteDefinition, PublicRouteMeta, PublicSeoContext, PublicSiteInfo, CardRenderOptions } from "../public/define";
import { canonicalQuery, decodeQuerySegment, EMPTY_QUERY_SEGMENT } from "../public/query";
import { buildPath, patternParamNames, validateParams } from "../public/route-pattern";
import { serializeJsonLd, statusMetadata, toNextMetadata, type PublicSeo, type SeoContext } from "../public/seo";
import { normalizeTags } from "../public/tags";
import type { ObjectRef, ObjectSummary, PublicCard } from "../public/types";
import { createPublicBackend } from "./backend";
import { goneStore } from "./gone";
import type { ServerI18n } from "./i18n";

/** 查询变体路由里装编码后查询串的参数名（目录 `~q/[_q]`）；`_` 开头，模块参数名不可能与它重名。 */
export const QUERY_PARAM = "_q";

export interface PublicRuntimeDeps {
  site: Omit<PublicSiteInfo, "name"> & {
    verification?: SeoContext["verification"];
    /** 站点 feed（有站点 feed 贡献时） */
    siteFeed?: { titleKey: string; href: string };
  };
  /** 站点品牌名（底座的 getSiteBrand，自带缓存） */
  brandName(): Promise<string>;
  i18n: ServerI18n;
  /** 已装配的公开路由：key → 形态（ctx.href 用） */
  routePatterns: Readonly<Record<string, string>>;
  renderSlot(target: string, props: { objectRef: ObjectRef; summary: ObjectSummary }, ctx: PublicSeoContext): React.ReactNode;
  renderCards(cards: readonly PublicCard[], options: CardRenderOptions | undefined, ctx: PublicSeoContext): React.ReactNode;
}

type RawParams = Record<string, string | string[] | undefined>;
type ResolvedRequest = { params: Record<string, string>; query: Record<string, string> };
type Loader<D> = (params: Record<string, string>, query: Record<string, string>) => Promise<PublicLoadResult<D>>;

function profileFor<D>(result: PublicLoadResult<D>, meta: PublicRouteMeta): PublicCacheProfileName {
  switch (result.kind) {
    case "ok": return result.cache ?? (meta.cache === "dynamic" ? "list" : meta.cache);
    case "not_found": return "list";
    case "unavailable": return "unavailable";
    case "gone": return "gone";
    case "redirect": return meta.cache === "dynamic" ? "list" : meta.cache;
  }
}

/** 校验 URL 参数与查询段；任何一处不合法返回 null（→ 404，不打后端）。 */
export function resolveRequest(raw: RawParams, meta: Pick<PublicRouteMeta, "pattern" | "params" | "query" | "fixed">): ResolvedRequest | null {
  const path: Record<string, string> = {};
  let encodedQuery: string | undefined;
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value !== "string") return null;
    if (name === QUERY_PARAM) encodedQuery = value;
    else path[name] = value;
  }
  const params = validateParams(path, meta.params);
  if (!params) return null;
  let query: Record<string, string> = {};
  if (encodedQuery === EMPTY_QUERY_SEGMENT) {
    // 只有无路径参数的路由由 proxy 改写成「空查询段」；带参数的路由不接受它（同一页面只有一个缓存条目）
    if (patternParamNames(meta.pattern).length) return null;
  } else if (encodedQuery !== undefined) {
    const decoded = decodeQuerySegment(encodedQuery, meta.query);
    if (!decoded) return null;
    query = decoded;
  }
  return { params: { ...params, ...meta.fixed }, query };
}

/** 页面的规范路径：按路由形态与路径参数生成（实例的固定参数不在路径里）。 */
export function pathOf(meta: Pick<PublicRouteMeta, "pattern" | "fixed">, params: Record<string, string>): string {
  const pathParams = Object.fromEntries(Object.entries(params).filter(([k]) => !(k in meta.fixed)));
  return buildPath(meta.pattern, pathParams);
}

export function createPublicRuntime(deps: PublicRuntimeDeps) {
  const site = deps.site;

  function href(routeKey: string, params: Record<string, string | number> = {}): string | null {
    const pattern = deps.routePatterns[routeKey];
    return pattern ? buildPath(pattern, params) : null;
  }

  async function seoContext(meta: PublicRouteMeta, request: ResolvedRequest): Promise<PublicSeoContext> {
    const [name, t] = await Promise.all([deps.brandName(), deps.i18n.getServerT(meta.namespace, site.locale)]);
    return { params: request.params, query: request.query, locale: site.locale, site: { ...site, name }, t, href, path: pathOf(meta, request.params) };
  }

  async function forwardedHeaders(meta: PublicRouteMeta): Promise<Record<string, string> | undefined> {
    // 只有不缓存的 dynamic 路由才碰请求头；可缓存的渲染不能依赖请求（§5）
    if (meta.cache !== "dynamic") return undefined;
    // 先声明「请求期渲染」：之后取数客户端读当前时间（预算截止）不再被当成预渲染期的不稳定值
    await connection();
    return forwardedClientHeaders(await headers());
  }

  /**
   * 在路由文件的 `"use cache"` 函数里调用（dynamic 路由则直接调用，不缓存）：执行模块的 `load`，
   * 按结果打标签、选档位。抛出的错误（后端不可用、超时）原样上抛 → 500，不进缓存；有旧缓存时 Next 继续给旧的。
   */
  async function runLoad<D>(route: PublicRouteDefinition<D>, meta: PublicRouteMeta, params: Record<string, string>, query: Record<string, string>, clientHeaders?: Record<string, string>): Promise<PublicLoadResult<D>> {
    const base = await seoContext(meta, { params, query });
    const ctx: PublicLoadContext = { ...base, backend: createPublicBackend({ headers: clientHeaders }) };
    const result = await route.load(ctx);
    if (meta.cache !== "dynamic") {
      cacheLife(cacheProfile(profileFor(result, meta)));
      const tags = result.kind === "redirect" ? [] : normalizeTags(result.tags ?? []);
      if (tags.length) cacheTag(...tags);
    }
    return result;
  }

  /** `load` 是路由文件里的 `"use cache"` 包装；dynamic 路由不缓存，传 null。 */
  function createPage<D>(route: PublicRouteDefinition<D>, meta: PublicRouteMeta, load: Loader<D> | null) {
    async function resolve(props: { params: Promise<RawParams> }) {
      const request = resolveRequest(await props.params, meta);
      if (!request) return null;
      const result = meta.cache === "dynamic" || !load
        ? await runLoad(route, meta, request.params, request.query, await forwardedHeaders(meta))
        : await load(request.params, request.query);
      return { request, result };
    }

    const currentPath = (request: ResolvedRequest): string => pathOf(meta, request.params);

    function seoInput(request: ResolvedRequest, siteName: string, feedTitle: string | undefined): SeoContext {
      return {
        origin: site.origin,
        siteName,
        locale: site.locale,
        path: currentPath(request),
        query: canonicalQuery(new URLSearchParams(request.query), meta.query),
        indexable: meta.indexable,
        verification: site.verification,
        siteFeed: site.siteFeed && feedTitle ? { title: feedTitle, href: site.siteFeed.href } : undefined,
      };
    }

    async function generateMetadata(props: { params: Promise<RawParams> }): Promise<Metadata> {
      const resolved = await resolve(props);
      const siteT = await deps.i18n.getServerT("site", site.locale);
      if (!resolved || resolved.result.kind === "not_found" || resolved.result.kind === "unavailable" || resolved.result.kind === "gone") {
        return statusMetadata(siteT("status.notFound.title"));
      }
      if (resolved.result.kind === "redirect") return {};
      const ctx = await seoContext(meta, resolved.request);
      const feedTitle = site.siteFeed ? siteT(site.siteFeed.titleKey) : undefined;
      return toNextMetadata(route.seo(resolved.result.data, ctx), seoInput(resolved.request, ctx.site.name, feedTitle));
    }

    async function Page(props: { params: Promise<RawParams> }) {
      const resolved = await resolve(props);
      if (!resolved) notFound();
      const { request, result } = resolved;
      switch (result.kind) {
        case "not_found":
        case "unavailable":
          notFound();
        case "gone":
          // 页面层只能给 404；把地址记进已删除集合，下一个请求起由 proxy 直接给 410（§7.2）
          if (meta.goneAware) await goneStore().add([currentPath(request)]);
          notFound();
        case "redirect":
          if (result.permanent) permanentRedirect(result.to);
          redirect(result.to);
        case "ok": {
          const base = await seoContext(meta, request);
          const seo: PublicSeo = route.seo(result.data, base);
          const ctx: PublicPageContext = {
            ...base,
            renderSlot: (target, slotProps) => deps.renderSlot(target, slotProps, base),
            renderCards: (cards, options) => deps.renderCards(cards, options, base),
          };
          const RoutePage = route.Page;
          return (
            <>
              {/* 路由身份（React 提升到 <head>）：真实用户 Web Vitals 按路由形态分组（§10.7），不含任何个人数据 */}
              <meta name="neton-route" content={meta.key} />
              <meta name="neton-route-pattern" content={meta.pattern} />
              {seo.pagination?.prev && <link rel="prev" href={seo.pagination.prev} />}
              {seo.pagination?.next && <link rel="next" href={seo.pagination.next} />}
              {(seo.jsonLd ?? []).map((item, i) => (
                <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(item) }} />
              ))}
              <RoutePage data={result.data} ctx={ctx} />
            </>
          );
        }
      }
    }

    return { Page, generateMetadata };
  }

  return { runLoad, createPage, href, profiles: PUBLIC_CACHE_PROFILES };
}

export type PublicRuntime = ReturnType<typeof createPublicRuntime>;
