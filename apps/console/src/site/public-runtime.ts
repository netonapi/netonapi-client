import { setMediaLoader } from "@neton/application-client-runtime/public";
import { createPublicRuntime } from "@neton/application-client-runtime/public-server";
import { routePatterns, siteFeedRegistry } from "@/generated/public.generated";
import { site } from "@/generated/site.generated";
import { getSiteBrand } from "@/lib/site-brand";
import { renderCards } from "./cards";
import { siteMediaLoader } from "./media-loader";
import { serverI18n } from "./server-i18n";
import { renderSlot } from "./slots";

// 每个公开路由文件都导入本模块：在任何 <MediaImage> 渲染之前装上站点的媒体加载器
setMediaLoader(siteMediaLoader);

/**
 * 公开路由的渲染管线，绑定本发行版的站点配置、品牌、语言包与构建期注册表。生成的路由文件只调用它。
 */
export const publicRuntime = createPublicRuntime({
  site: {
    origin: site.origin,
    consoleBasePath: site.consoleBasePath,
    locale: site.locale,
    timeZone: site.timeZone,
    verification: site.verification,
    siteFeed: siteFeedRegistry.length && site.feeds.site ? { titleKey: site.feeds.site.title, href: "/rss.xml" } : undefined,
  },
  brandName: async () => (await getSiteBrand()).name,
  i18n: serverI18n,
  routePatterns,
  renderSlot,
  renderCards,
});
