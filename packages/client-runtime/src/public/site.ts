/**
 * 站点配置的解析与校验（public-routes §3）。生成脚本与 next.config 都调它，结果写进生成物，
 * 运行期只读生成物——同一份规则只有一处实现。
 */
import type { LoginMethod, SiteConfig, SitePageDeclaration, SiteRouteInstance } from "@neton/application-client-contract";
import { assertCacheFitsMediaValidity } from "./cache-profiles";
import { normalizeConsoleBasePath } from "./next-path";

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
  media: { signedUrlValiditySeconds?: number };
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
  const media = { signedUrlValiditySeconds: config.media?.signedUrlValiditySeconds };
  assertCacheFitsMediaValidity(media.signedUrlValiditySeconds);
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
    media,
  };
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
