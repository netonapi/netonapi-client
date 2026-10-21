import { publicNamespaces } from "@/generated/public.generated";
import { site } from "@/generated/site.generated";
import { MEDIA_REFRESH_SCRIPT } from "@neton/application-client-runtime/public";
import { getSiteBrand } from "@/lib/site-brand";
import PortalShell from "./portal-shell";
import { PublicProviders } from "./public-providers";
import { serverI18n } from "./server-i18n";
import "./public.css";

/**
 * 公开页面的外框：门户样式表、图片兜底脚本、客户端 Provider（服务端语言、预载词条、会话水合）+ 门户外壳。
 * `(public)` 布局与站点级 404 共用。不读请求、不读会话——整页缓存的前提。
 */
export async function PublicFrame({ children }: { children: React.ReactNode }) {
  // 客户端岛的词条由服务端按站点语言一次性给出（不进客户端包）：运行时的错误码翻译、门户 `site` 整份，
  // 模块命名空间只给公开岛可用的 `public.*` / `error.*`（public-routes §12）
  const [brand, host, modules] = await Promise.all([
    getSiteBrand(),
    serverI18n.catalogsFor(["errors", "site"], site.locale),
    serverI18n.catalogsFor(publicNamespaces, site.locale, { publicKeysOnly: true }),
  ]);
  const preloaded = { ...host, ...modules };
  return (
    <>
      {/* 长开标签页的图片兜底（infra-media §7.3）：先于任何图片执行，捕获阶段监听 error */}
      <script dangerouslySetInnerHTML={{ __html: MEDIA_REFRESH_SCRIPT }} />
      <PublicProviders locale={site.locale} timeZone={site.timeZone} consoleBasePath={site.consoleBasePath} preloaded={preloaded}>
        <PortalShell brand={brand} locale={site.locale} origin={site.origin} consoleBasePath={site.consoleBasePath}>{children}</PortalShell>
      </PublicProviders>
    </>
  );
}
