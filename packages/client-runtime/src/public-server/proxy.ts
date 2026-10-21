/**
 * 底座 proxy（Next 16 的请求代理，public-routes §2、§4、§7.2、§13）的全部规则。生成的
 * `public-proxy.generated.ts` 只给数据；这里不依赖任何模块代码，proxy 的打包入口保持很小。
 *
 * 顺序：
 * 1. 内部地址（`~q` 查询段）不接受外部直接访问 → 404；
 * 2. 控制台：没有会话 Cookie 直接 307 到 `/login?next=<原地址>`；有 Cookie 时把原地址放进请求头，
 *    让受保护布局在会话失效时也能带上 next；
 * 3. 旧 URL 形态（legacy）→ 308 到当前形态；
 * 4. goneAware 路由且地址在已删除集合里 → 410：proxy 直接给出生成期写好的静态 410 页（noindex）。
 *    不用「改写到一个 410 页面 + 状态码」：Next 16 不保证改写响应带上 proxy 给的状态码（实测时有时无）。
 * 5. 带白名单查询参数的公开路由 → 改写到 `<路径>/~q/<规范编码>`（白名单外的参数丢掉，见 query.ts）；
 *    没有路径参数的可缓存路由（`queryOnly`，如首页）只有查询变体，裸地址也改写进去（`/` → `/~q/-`），
 *    于是它们按需渲染、构建期不预渲染（public-routes §1a）。
 */
import { NextResponse, type NextRequest } from "next/server";
import { isConsolePath, loginHref } from "../public/next-path";
import { canonicalQuery, EMPTY_QUERY_SEGMENT, encodeQuerySegment, QUERY_SEGMENT } from "../public/query";
import { buildPath, matchPattern } from "../public/route-pattern";
import { goneStore } from "./gone";

export const PATHNAME_HEADER = "x-neton-pathname";
const SESSION_COOKIE = "neton_client_session";

export interface PublicProxyRoute {
  key: string;
  pattern: string;
  query: string[];
  goneAware: boolean;
  /**
   * 路由只生成了查询变体（没有路径参数、且不是 dynamic 档）：裸地址也要改写到 `~q/-`。
   * 生成脚本给出；缺省 false。
   */
  queryOnly?: boolean;
}

export interface PublicProxyConfig {
  consoleBasePath: string;
  /** 所有公开路由与 fork 页面（含实例） */
  routes: PublicProxyRoute[];
  /** 旧形态 → 当前形态（参数名集合相同） */
  legacy: { from: string; to: string }[];
  /** 控制台前缀为空时，这些路径不属于控制台（登录注册页、接口、SEO 文件） */
  nonConsole: string[];
  /** 410 页的完整 HTML（站点语言、noindex），生成期由站点词条写好 */
  goneHtml: string;
}

/** 410 响应：缓存一天（与 gone 档一致），恢复上线时由失效端点的 revived 移出集合、CDN 由 site 模块刷新。 */
export const GONE_CACHE_CONTROL = "public, s-maxage=86400, stale-while-revalidate=604800";

function underAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isInternal(pathname: string): boolean {
  return pathname.split("/").includes(QUERY_SEGMENT);
}

export function createPublicProxy(config: PublicProxyConfig) {
  const portal = config.consoleBasePath !== "";

  return async function publicProxy(request: NextRequest): Promise<NextResponse> {
    const { pathname, search } = request.nextUrl;

    if (isInternal(pathname)) return new NextResponse(null, { status: 404 });

    const inConsole = portal ? isConsolePath(pathname, config.consoleBasePath) : !underAny(pathname, config.nonConsole);
    if (inConsole) {
      if (!request.cookies.get(SESSION_COOKIE)?.value) {
        return NextResponse.redirect(new URL(loginHref(`${pathname}${search}`, config.consoleBasePath), request.url), 307);
      }
      const forwarded = new Headers(request.headers);
      forwarded.set(PATHNAME_HEADER, `${pathname}${search}`);
      return NextResponse.next({ request: { headers: forwarded } });
    }
    if (!portal) return NextResponse.next();

    for (const { from, to } of config.legacy) {
      const params = matchPattern(from, pathname);
      if (params) return NextResponse.redirect(new URL(`${buildPath(to, params)}${search}`, request.url), 308);
    }

    for (const route of config.routes) {
      if (!matchPattern(route.pattern, pathname)) continue;
      if (route.goneAware && (await goneStore().has(pathname))) {
        return new NextResponse(config.goneHtml, {
          status: 410,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": GONE_CACHE_CONTROL, "X-Robots-Tag": "noindex" },
        });
      }
      const canonical = route.query.length && search ? canonicalQuery(request.nextUrl.searchParams, route.query) : "";
      if (canonical || route.queryOnly) {
        // nextUrl.clone()：保持 Next 眼中的同一个源。用 request.url 重建时主机可能是 localhost 而服务绑在
        // 127.0.0.1（或反代后的内部主机名），源一变，改写就成了「代理到外部地址」，请求落空成 404
        const target = request.nextUrl.clone();
        const segment = canonical ? encodeQuerySegment(canonical) : EMPTY_QUERY_SEGMENT;
        target.pathname = `${pathname === "/" ? "" : pathname}/${QUERY_SEGMENT}/${segment}`;
        target.search = "";
        return NextResponse.rewrite(target);
      }
      return NextResponse.next();
    }
    return NextResponse.next();
  };
}
