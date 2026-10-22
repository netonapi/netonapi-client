/**
 * CDN 缓存规则（public-routes §8.2a，itwind C5）：由站点配置与公开路由**生成**，不手写。
 *
 * 源站已经按这些规则回应（e2e 逐条核对），CDN 照着配置就能安全地缓存 HTML：
 *
 * - **绕过**：控制台前缀、`/api/`、登录注册页——源站对它们回 `private, no-store`（跳登录的 307 也是）；
 * - **缓存键**：只看路径与白名单查询参数（全部公开路由白名单的并集），**忽略 Cookie**、忽略其余查询参数（`utm_*`、`fbclid`……
 *   源站本来就把它们丢掉再渲染，HTML 逐字节相同）；忽略 `Vary` 里除 `Accept-Encoding` 外的头（Next 的 `rsc`、
 *   `next-router-*` 只用于客户端路由请求，门户一律整页导航，带 `RSC` 头的请求源站回 400，不进缓存）；
 * - **时长**：HTML 遵循源站的 `Cache-Control`（`s-maxage` = 档位的 revalidate，`stale-while-revalidate` 到 expire），
 *   `/_next/static/` 一年（文件名带内容哈希）；5xx、带 `Set-Cookie`、`private` / `no-store` 的回应不缓存；
 *   回源失败时给旧内容（`stale-if-error`，CDN 侧开启，源站不输出）；
 * - **刷新**：site 模块在失效端点投递成功之后按对象地址刷新（site-module §5.2），列表页靠短 `s-maxage`。
 */
import { reservedPrefixes, type ResolvedSite } from "./site";

export interface CdnRules {
  version: 1;
  origin: string;
  host: string;
  /** 一律回源、不缓存的路径（前缀）；源站对它们回 `private, no-store`。 */
  bypass: { prefix: string; reason: "console" | "api" | "auth" }[];
  cacheKey: {
    cookies: "ignore";
    /** 进缓存键的查询参数（其余全部剥掉）。 */
    queryKeep: string[];
    /** 只认 `Accept-Encoding`（压缩协商由 CDN 处理），其余 `Vary` 头忽略。 */
    vary: ["Accept-Encoding"];
  };
  ttl: {
    html: "origin-cache-control";
    static: { prefix: "/_next/static/"; maxAgeSeconds: number; immutable: true };
    staleIfErrorSeconds: number;
  };
  /** 出现任何一条就不缓存（CDN 的「遵循源站」缺省就是这样，列出来便于核对）。 */
  neverCache: string[];
}

export interface CdnRouteInput { pattern: string; query: readonly string[] }

const AUTH_PATHS = ["/login", "/register", "/forgot-password"];

export function cdnRules(site: Pick<ResolvedSite, "origin" | "consoleBasePath">, routes: readonly CdnRouteInput[]): CdnRules {
  const bypass: CdnRules["bypass"] = [];
  // 控制台在根路径（没有门户）的产品：整站都是登录后的页面，CDN 只缓存静态资源
  bypass.push({ prefix: site.consoleBasePath || "/", reason: "console" });
  bypass.push({ prefix: "/api", reason: "api" });
  for (const p of AUTH_PATHS) bypass.push({ prefix: p, reason: "auth" });
  const known = new Set(reservedPrefixes(site));
  for (const b of bypass) if (b.prefix !== "/" && !known.has(b.prefix)) throw new Error(`bypass prefix ${b.prefix} is not reserved`);
  const queryKeep = [...new Set(routes.flatMap((r) => r.query))].sort();
  return {
    version: 1,
    origin: site.origin,
    host: new URL(site.origin).host,
    bypass,
    cacheKey: { cookies: "ignore", queryKeep, vary: ["Accept-Encoding"] },
    ttl: {
      html: "origin-cache-control",
      static: { prefix: "/_next/static/", maxAgeSeconds: 31_536_000, immutable: true },
      staleIfErrorSeconds: 86_400,
    },
    neverCache: ["status >= 500", "Set-Cookie", "Cache-Control: private", "Cache-Control: no-store", "request header RSC"],
  };
}

/** 一个请求地址在这套规则下的缓存键（e2e 与部署核对用）：绕过返回 null。 */
export function cdnCacheKey(rules: CdnRules, url: string): string | null {
  const u = new URL(url, rules.origin);
  if (rules.bypass.some((b) => b.prefix === "/" || u.pathname === b.prefix || u.pathname.startsWith(`${b.prefix}/`))) return null;
  const kept = [...u.searchParams.entries()].filter(([k]) => rules.cacheKey.queryKeep.includes(k)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = new URLSearchParams(kept).toString();
  return `${u.pathname}${query ? `?${query}` : ""}`;
}

/** 给人看的版本（`pnpm cdn:rules --text`）：与部署指南里的 CDN 控制台设置一一对应。 */
export function cdnRulesText(rules: CdnRules): string {
  const lines = [
    `CDN rules for ${rules.origin} (public-routes §8.2a)`,
    "",
    "Bypass (no cache, forward cookies):",
    ...rules.bypass.map((b) => `  ${b.prefix === "/" ? "/*" : `${b.prefix}, ${b.prefix}/*`}   (${b.reason})`),
    "",
    "Cache key:",
    "  cookies: ignored",
    `  query string: keep only ${rules.cacheKey.queryKeep.length ? rules.cacheKey.queryKeep.join(", ") : "(none)"}; drop all other parameters`,
    `  vary: ${rules.cacheKey.vary.join(", ")} only`,
    "",
    "TTL:",
    "  HTML: follow the origin Cache-Control (s-maxage, stale-while-revalidate)",
    `  ${rules.ttl.static.prefix}*: ${rules.ttl.static.maxAgeSeconds} s, immutable`,
    `  stale-if-error: ${rules.ttl.staleIfErrorSeconds} s (enable on the CDN; the origin does not send it)`,
    "",
    `Never cache: ${rules.neverCache.join("; ")}`,
  ];
  return `${lines.join("\n")}\n`;
}
