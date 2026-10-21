/**
 * 登录跳回（public-routes §9.2）与控制台地址。
 *
 * `next` 必须是本站相对路径：以单个 `/` 开头（不是 `//` 或 `/\`，那是协议相对地址）、不含控制字符、
 * 不进 `/api/`；URL 解码之后再按同样的规则检查一次（`/%2F%2Fevil.com` 解码后是 `//evil.com`）。
 * 不合格一律回退到控制台首页。
 */

const CONTROL = /[\u0000-\u001f\u007f]/;

function acceptable(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return false;
  if (CONTROL.test(path) || path.includes("\\")) return false;
  const pathname = path.split(/[?#]/, 1)[0]!;
  if (pathname === "/api" || pathname.startsWith("/api/")) return false;
  return true;
}

/** 合格的跳回地址原样返回，否则返回 fallback。 */
export function safeNextPath(raw: string | null | undefined, fallback: string): string {
  if (!raw || raw.length > 2048) return fallback;
  if (!acceptable(raw)) return fallback;
  let decoded: string;
  try { decoded = decodeURIComponent(raw); } catch { return fallback; }
  if (!acceptable(decoded)) return fallback;
  // 解析后必须仍是同源路径（挡住 `/.\./` 一类规范化后变形的写法）
  const resolved = new URL(raw, "http://same.origin");
  if (resolved.origin !== "http://same.origin") return fallback;
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

/** 规范化控制台前缀：`/` → `""`，`/my/` → `/my`。 */
export function normalizeConsoleBasePath(base: string | undefined): string {
  const trimmed = (base ?? "/").trim().replace(/\/+$/, "");
  return trimmed === "" ? "" : trimmed;
}

/** 控制台内路径（manifest 的 pages[].path）→ 站点地址。模块里禁止写死前缀，一律用它。 */
export function consoleHref(path: string, consoleBasePath: string): string {
  const base = normalizeConsoleBasePath(consoleBasePath);
  if (!path.startsWith("/")) throw new Error(`console path must be absolute: ${path}`);
  if (!base) return path;
  return path === "/" ? base : `${base}${path}`;
}

/** 路径是否属于控制台（前缀为空时整站都是控制台）。 */
export function isConsolePath(pathname: string, consoleBasePath: string): boolean {
  const base = normalizeConsoleBasePath(consoleBasePath);
  if (!base) return true;
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** `/login?next=<编码后的路径>`；next 为空或就是控制台首页时省略参数。 */
export function loginHref(next: string | null | undefined, consoleBasePath: string): string {
  const home = consoleHref("/", consoleBasePath);
  const target = safeNextPath(next, home);
  return target === home ? "/login" : `/login?next=${encodeURIComponent(target)}`;
}
