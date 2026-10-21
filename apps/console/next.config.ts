import type { NextConfig } from "next";
import { site } from "./src/generated/site.generated";
import build from "./src/generated/next.generated.json";

// 注册表生成（predev / prebuild，scripts/generate-registry.mts）已经用 resolveSite() 解析并校验了站点配置
// （含缓存档位与签名媒体有效期的约束，失败即中断）与装配清单；这里只读它的生成物——换一份装配清单 /
// 站点配置（底座端到端测试的夹具）时，next.config 与生成的路由文件天然一致。

const config: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  /** 构建产物目录：缺省 .next；底座端到端测试用独立目录，不覆盖开发构建。 */
  distDir: process.env.NETON_NEXT_DIST_DIR || ".next",
  /**
   * 公开页面的缓存模型（public-routes §8）：`"use cache"` + `cacheTag` + `cacheLife`，整页 ISR；
   * Partial Prefetching 是 Cache Components 的配套开关（公开页面用整页导航，不依赖客户端预取）。
   * 缓存档位的时长在运行时包的 PUBLIC_CACHE_PROFILES，调用处直接传对象（单一来源）。
   */
  cacheComponents: true,
  partialPrefetching: true,
  env: {
    // 客户端代码（apiFetch 的登录跳转、consoleHref）需要知道控制台前缀；构建期常量
    NEXT_PUBLIC_NETON_CONSOLE_BASE_PATH: site.consoleBasePath || "/",
  },
  transpilePackages: [
    "@neton/application-client-contract",
    "@neton/application-front-workspace",
    "@neton/application-client-runtime",
    "@neton/application-client-kit",
    "@neton/application-client-resource",
    ...build.transpilePackages,
  ],
};

export default config;
