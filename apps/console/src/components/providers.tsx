"use client";

import * as React from "react";
import { I18nProvider, type I18nConfig } from "@neton/application-client-runtime/i18n";
import { runtimeCatalogs } from "@neton/application-client-runtime/messages";
import { localeRegistry } from "@/generated/modules.generated";
import { site } from "@/generated/site.generated";
import { consoleCatalogs } from "@/messages";

/** 控制台与登录注册页可选的语言 = 站点配置的 locales（与门户同一份来源）；时区跟随浏览器。 */
const config: I18nConfig = { locales: site.supportedLocales, defaultLocale: site.locale };
const catalogs = { ...runtimeCatalogs, ...consoleCatalogs };

/**
 * 根部的客户端 Provider：国际化。运行时词条（通用错误说明 `errors`）与宿主词条（`console`）静态打入，
 * 模块词条（manifest 的 `locales`，命名空间 = 模块 id）随模块懒加载。
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider config={config} registry={localeRegistry} catalogs={catalogs}>
      {children}
    </I18nProvider>
  );
}
