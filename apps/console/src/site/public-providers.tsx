"use client";

import * as React from "react";
import { I18nProvider, type StaticCatalogs } from "@neton/application-client-runtime/i18n";
import { PublicSessionProvider } from "@neton/application-client-runtime/public-client";

const NO_LAZY_NAMESPACES = {};

/**
 * 公开页面的客户端 Provider（public-routes §9、§12）：
 * - 语言由服务端决定（站点配置的唯一语言），不读本地偏好——首帧与缓存的 HTML 逐字节一致；
 * - 词条全部由服务端给出（`preloaded`：站点语言的运行时错误码、门户 `site`、模块的公开 key）。本文件不导入
 *   任何语言包或模块注册表：公开页的客户端包里没有控制台的词条、没有模块清单，也不按需加载命名空间；
 * - 会话在水合后取（`/api/session`），服务端 HTML 恒为匿名态。
 */
export function PublicProviders({ locale, timeZone, consoleBasePath, preloaded, children }: {
  locale: string;
  timeZone: string;
  consoleBasePath: string;
  preloaded: StaticCatalogs;
  children: React.ReactNode;
}) {
  const config = React.useMemo(() => ({ locales: [locale], defaultLocale: locale, timeZone }), [locale, timeZone]);
  return (
    <I18nProvider config={config} registry={NO_LAZY_NAMESPACES} catalogs={preloaded} serverLocale>
      <PublicSessionProvider consoleBasePath={consoleBasePath}>{children}</PublicSessionProvider>
    </I18nProvider>
  );
}
