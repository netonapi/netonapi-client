/**
 * 公开路由的查询参数（public-routes §4 `query`）。
 *
 * Cache Components 下读 `searchParams` 就是请求期数据，页面再也不能整页缓存。所以底座把查询参数
 * 「挪进路径」：proxy 只保留白名单里的参数、排序、编码成一个路径段，内部改写到
 * `<路由>/~q/<编码>`；页面从 params 里读它。效果：
 * - 白名单外的参数（utm_* 之类）根本到不了页面，也不进缓存键；
 * - `?b=2&a=1` 与 `?a=1&b=2` 命中同一份缓存；
 * - 带查询的页面照样是可缓存的整页（ISR），状态码照样准确。
 * 外部直接访问 `~q` 段一律 404（proxy 拦截），它只是内部地址。
 */

/** 生成的查询变体路由的目录名；以 `~` 开头，不会与任何合法的静态段（小写字母数字开头）冲突。 */
export const QUERY_SEGMENT = "~q";

/**
 * 「没有查询参数」的查询段。没有路径参数的路由（首页、`/hot`）只生成查询变体路由文件，proxy 把裸地址
 * 也改写进来（`/` → `/~q/-`）：这样它们与带参数的路由一样是「按需渲染 + ensureStatic」，构建期不预渲染、
 * 不连后端（public-routes §1a）。`-` 不可能是 base64url 编码的结果（非空串编码至少两个字符），
 * 不会与任何真实查询串混淆。
 */
export const EMPTY_QUERY_SEGMENT = "-";

/** 单个查询参数值的上限；超出整条请求按无该参数处理（避免巨型缓存键）。 */
export const MAX_QUERY_VALUE = 512;

/** 按白名单规范化：只取每个键的第一个非空值，按键排序。返回 `a=1&b=2` 或空串。 */
export function canonicalQuery(search: URLSearchParams, whitelist: readonly string[] | undefined): string {
  if (!whitelist?.length) return "";
  const kept: [string, string][] = [];
  for (const key of [...new Set(whitelist)].sort()) {
    const value = search.get(key);
    if (value === null || value === "" || value.length > MAX_QUERY_VALUE) continue;
    kept.push([key, value]);
  }
  return new URLSearchParams(kept).toString();
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(segment: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(segment)) return null;
  try {
    const padded = segment.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((segment.length + 3) % 4);
    const binary = atob(padded);
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

export function encodeQuerySegment(canonical: string): string {
  return toBase64Url(canonical);
}

/**
 * 解码路径段里的查询参数。只接受**规范形式**（解码后再规范化必须得到同一个编码），
 * 否则返回 null —— 同一组参数只有一个缓存条目。
 */
export function decodeQuerySegment(segment: string, whitelist: readonly string[] | undefined): Record<string, string> | null {
  const text = fromBase64Url(segment);
  if (text === null || text === "") return null;
  const canonical = canonicalQuery(new URLSearchParams(text), whitelist);
  if (canonical === "" || encodeQuerySegment(canonical) !== segment) return null;
  return Object.fromEntries(new URLSearchParams(canonical));
}
