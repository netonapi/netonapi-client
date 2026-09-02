/**
 * Front 模块契约（NETON_APPLICATION_FRONT_SPEC §4）。
 * manifest 必须是纯静态数据：无副作用、无 JSX、无运行时依赖 —— 构建期注册表
 * 生成脚本会在 Node 里直接 import 它。
 */

export const FRONT_CONTRACT_VERSION = "1.0.0";

export type FrontPageRendering = "server" | "client";

export interface FrontPageManifest {
  /** == 后端 system_menus.component（如 "system/user/index"） */
  key: string;
  /** 完整路由路径（如 "/system/user"），与后端菜单树 path 拼接结果一致 */
  path: string;
  /** 包内页面入口：`<pkg>/pages/<entry>` 必须可被静态 import */
  entry: string;
  rendering: FrontPageRendering;
  /** 不由后端菜单直接下发的模块内页面，路由由模块自己声明。 */
  standalone?: boolean;
}

export interface FrontContribution {
  /** 扩展槽 id，如 "member.user.detail.tabs" */
  target: string;
  type: "tab" | "action" | "widget";
  id: string;
  entry: string;
  permission?: string;
}

export interface FrontLocaleManifest {
  lang: string;
  entry: string;
}

export interface FrontModuleManifest {
  /** 唯一模块 id，构建期查重 */
  id: string;
  /** 兼容的 contract 版本（当前按 major 匹配） */
  contractVersion: string;
  /** 依赖的其他模块 id，构建期校验存在性 */
  requires?: string[];
  pages: FrontPageManifest[];
  locales?: FrontLocaleManifest[];
  contributions?: FrontContribution[];
}

export function defineFrontModule(m: FrontModuleManifest): FrontModuleManifest {
  return m;
}
