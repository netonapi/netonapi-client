/**
 * 站点配置的解析与校验（public-routes §3）。生成脚本与 next.config 都调它，结果写进生成物，
 * 运行期只读生成物——同一份规则只有一处实现。
 */
import type { LoginMethod, SiteConfig, SitePageDeclaration, SiteRouteInstance } from "@neton/application-client-contract";
import { normalizeConsoleBasePath } from "./next-path";
import { parsePattern, patternsConflict, patternUnderPrefix, RoutePatternError } from "./route-pattern";

export interface ResolvedSite {
  origin: string;
  /** 规范化后的前缀：`""` = 控制台在根路径 */
  consoleBasePath: string;
  locale: string;
  supportedLocales: string[];
  timeZone: string;
  brand: { name: string; tagline: string };
  auth: { loginMethods: LoginMethod[]; defaultCallingCode: string };
  routes: { override: Record<string, string>; disable: string[]; instances: SiteRouteInstance[]; legacy: Record<string, string[]> };
  pages: SitePageDeclaration[];
  slots: { order: Record<string, string[]>; hide: string[] };
  robots: { disallow: string[]; deadLinkFile: boolean };
  verification: { google?: string; baidu?: string; bing?: string };
  feeds: { site?: { title: string } };
  /** 控制台在根路径时不需要会话的页面形态（§2.1b）；有门户时恒为空。 */
  anonymousPaths: string[];
  /** 真实用户 Web Vitals 上报（§10.7）；null = 不上报。 */
  vitals: { endpoint: string; sampleRate: number } | null;
  /** 热点页面预热的站内路径（§8.7）。 */
  warmup: { paths: string[] };
}

export class SiteConfigError extends Error {
  constructor(message: string) {
    super(`[site] ${message}`);
    this.name = "SiteConfigError";
  }
}

const SEGMENT = /^[a-z0-9][a-z0-9._-]*$/;
const CALLING_CODE = /^\+[1-9][0-9]{0,3}$/;

function resolveOrigin(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new SiteConfigError(`origin is not an absolute URL: ${raw}`); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new SiteConfigError(`origin must be http(s): ${raw}`);
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new SiteConfigError(`origin must be scheme://host[:port] only: ${raw}`);
  }
  return url.origin;
}

/** `env.NETON_SITE_ORIGIN` 覆盖 origin（部署配置，构建期读取）。 */
export function resolveSite(config: SiteConfig, env: Record<string, string | undefined> = {}): ResolvedSite {
  const origin = resolveOrigin(env.NETON_SITE_ORIGIN?.trim() || config.origin);
  const consoleBasePath = normalizeConsoleBasePath(config.consoleBasePath);
  if (consoleBasePath && (!consoleBasePath.startsWith("/") || !consoleBasePath.slice(1).split("/").every((s) => SEGMENT.test(s)))) {
    throw new SiteConfigError(`consoleBasePath must be "/" or plain lowercase segments like "/my": ${config.consoleBasePath}`);
  }
  const { default: locale, supported, prefix } = config.locales;
  if (prefix !== "none") throw new SiteConfigError(`locales.prefix "${prefix}" is not supported yet (one language per deployment)`);
  if (!supported.includes(locale)) throw new SiteConfigError(`locales.supported must include the default locale ${locale}`);
  const loginMethods = config.auth?.loginMethods ?? ["password"];
  if (!loginMethods.length || loginMethods.some((m) => m !== "password" && m !== "sms") || new Set(loginMethods).size !== loginMethods.length) {
    throw new SiteConfigError(`auth.loginMethods must be a non-empty list of "password" / "sms": ${JSON.stringify(loginMethods)}`);
  }
  const defaultCallingCode = config.auth?.defaultCallingCode ?? "+86";
  if (!CALLING_CODE.test(defaultCallingCode)) throw new SiteConfigError(`auth.defaultCallingCode must look like "+86": ${defaultCallingCode}`);
  const timeZone = config.timeZone ?? "Asia/Shanghai";
  try { new Intl.DateTimeFormat("en", { timeZone }); } catch { throw new SiteConfigError(`timeZone is not a valid IANA zone: ${timeZone}`); }
  const anonymousPaths = resolveAnonymousPaths(config.anonymousPaths ?? [], consoleBasePath);
  const vitals = resolveVitals(config.vitals);
  const warmup = resolveWarmup(config.warmup, consoleBasePath);
  return {
    origin,
    consoleBasePath,
    locale,
    supportedLocales: [...supported],
    timeZone,
    brand: { name: config.brand?.name ?? "Neton", tagline: config.brand?.tagline ?? "" },
    auth: { loginMethods: [...loginMethods], defaultCallingCode },
    routes: {
      override: { ...(config.routes?.override ?? {}) },
      disable: [...(config.routes?.disable ?? [])],
      instances: [...(config.routes?.instances ?? [])],
      legacy: { ...(config.routes?.legacy ?? {}) },
    },
    pages: [...(config.pages ?? [])],
    slots: { order: { ...(config.slots?.order ?? {}) }, hide: [...(config.slots?.hide ?? [])] },
    robots: { disallow: [...(config.robots?.disallow ?? [])], deadLinkFile: config.robots?.deadLinkFile ?? false },
    verification: { ...(config.verification ?? {}) },
    feeds: { ...(config.feeds ?? {}) },
    anonymousPaths,
    vitals,
    warmup,
  };
}

const MAX_WARMUP_PATHS = 20;

/** 预热地址：站内路径、不带查询串与锚点、不在保留前缀里；缺省有门户时只有首页。 */
function resolveWarmup(warmup: { paths: string[] } | undefined, consoleBasePath: string): ResolvedSite["warmup"] {
  const paths = warmup?.paths ?? (consoleBasePath ? ["/"] : []);
  if (paths.length > MAX_WARMUP_PATHS) throw new SiteConfigError(`warmup.paths allows at most ${MAX_WARMUP_PATHS} paths`);
  const reserved = reservedPrefixes({ consoleBasePath });
  for (const path of paths) {
    if (typeof path !== "string" || !/^\/[^?#\s]*$/.test(path) || path.includes("//")) throw new SiteConfigError(`warmup.paths: not a site path: ${String(path)}`);
    const prefix = reserved.find((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`));
    if (prefix) throw new SiteConfigError(`warmup.paths: ${path} is under the reserved prefix ${prefix}`);
  }
  return { paths: [...new Set(paths)] };
}

function resolveAnonymousPaths(paths: readonly string[], consoleBasePath: string): string[] {
  if (!paths.length) return [];
  if (consoleBasePath) {
    throw new SiteConfigError(`anonymousPaths only applies when the console sits at "/" (everything outside ${consoleBasePath} is already anonymous)`);
  }
  const reserved = reservedPrefixes({ consoleBasePath });
  const seen: string[] = [];
  for (const path of paths) {
    try { parsePattern(path); } catch (error) {
      throw new SiteConfigError(`anonymousPaths: ${error instanceof RoutePatternError ? error.message : String(error)}`);
    }
    if (path === "/") throw new SiteConfigError(`anonymousPaths cannot contain "/" (the console home)`);
    const prefix = reserved.find((p) => patternUnderPrefix(path, p));
    if (prefix) throw new SiteConfigError(`anonymousPaths: ${path} is under the reserved prefix ${prefix} (already handled by the base)`);
    const clash = seen.find((other) => patternsConflict(other, path));
    if (clash) throw new SiteConfigError(`anonymousPaths: ${path} overlaps ${clash}`);
    seen.push(path);
  }
  return seen;
}

/** 上报地址：站内绝对路径（不以 `//` 开头）或 https 绝对地址。 */
function resolveVitals(vitals: { endpoint: string; sampleRate: number } | undefined): ResolvedSite["vitals"] {
  if (!vitals) return null;
  const { endpoint, sampleRate } = vitals;
  const sameOrigin = endpoint.startsWith("/") && !endpoint.startsWith("//") && !endpoint.startsWith("/\\");
  let absolute = false;
  if (!sameOrigin) {
    try { absolute = new URL(endpoint).protocol === "https:"; } catch { absolute = false; }
  }
  if (!sameOrigin && !absolute) throw new SiteConfigError(`vitals.endpoint must be a same-origin path or an https URL: ${endpoint}`);
  if (typeof sampleRate !== "number" || !Number.isFinite(sampleRate) || sampleRate < 0 || sampleRate > 1) {
    throw new SiteConfigError(`vitals.sampleRate must be a number between 0 and 1: ${String(sampleRate)}`);
  }
  return { endpoint, sampleRate };
}

/** 公开路由与 fork 页面不得占用的前缀（§2.2）。 */
export function reservedPrefixes(site: Pick<ResolvedSite, "consoleBasePath">): string[] {
  return [
    ...(site.consoleBasePath ? [site.consoleBasePath] : []),
    "/api", "/login", "/register", "/forgot-password", "/_next", "/static",
    "/robots.txt", "/sitemap.xml", "/sitemaps", "/rss.xml", "/favicon.ico", "/.well-known", "/indexnow-key.txt",
  ];
}

/**
 * robots.txt 里底座固定禁止的路径（控制台、接口、登录注册页），再加站点配置的。
 * 只有控制台的产品（前缀为空）整站都是登录后的页面：全站禁止。
 */
export function robotsDisallow(site: Pick<ResolvedSite, "consoleBasePath" | "robots">): string[] {
  if (!site.consoleBasePath) return ["/"];
  return [
    `${site.consoleBasePath}/`, `${site.consoleBasePath}$`,
    "/api/", "/login", "/register", "/forgot-password",
    ...site.robots.disallow,
  ];
}
