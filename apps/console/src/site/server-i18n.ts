import { createServerI18n } from "@neton/application-client-runtime/public-server";
import { runtimeCatalogs } from "@neton/application-client-runtime/messages";
import { localeRegistry } from "@/generated/modules.generated";
import { site } from "@/generated/site.generated";
import { consoleCatalogs } from "@/messages";
import { siteCatalogs } from "./messages";

/** 服务端翻译（public-routes §12）：模块语言包 + 宿主静态词条（运行时、console、site）。 */
export const serverI18n = createServerI18n({
  registry: localeRegistry,
  catalogs: { ...runtimeCatalogs, ...consoleCatalogs, ...siteCatalogs },
  defaultLocale: site.locale,
});
