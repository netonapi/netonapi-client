import { defaultMediaLoader, type MediaLoader } from "@neton/application-client-runtime/public";

/**
 * 站点的媒体加载器（public-routes §10.4）：由后端给的媒体决定 `<img>` 的 `src` / `srcset`。
 * **产品 fork 可覆盖这个文件**（与 portal-shell.tsx 同一规则），例如换一套宽度选择规则；
 * 地址本身仍由后端 infra 生成（签名覆盖完整地址与处理参数，网页端不能自己拼）。
 */
export const siteMediaLoader: MediaLoader = defaultMediaLoader;
