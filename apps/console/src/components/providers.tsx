"use client";

import * as React from "react";
import { I18nProvider, i18nConfigFromEnv } from "@neton/application-client-runtime/i18n";
import { runtimeCatalogs } from "@neton/application-client-runtime/messages";
import { localeRegistry } from "@/generated/modules.generated";
import { consoleCatalogs } from "@/messages";

const config = i18nConfigFromEnv();
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
