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
  /** 不由后端菜单直接下发的模块内页面，例如 `/privchat/user/:id`。 */
  standalone?: boolean;
  /**
   * 决定**工作区实例身份**的参数名（路径参数或查询参数）。
   *
   * 只有这些参数变化才算「另一个资源」，才会新开页签；未列出的查询参数
   * 一律视为视图状态（翻页、筛选、切 section），落在同一个页签里。
   *
   * 省略 = 单例页面（列表页、配置页）。
   * 例：用户详情 `["id"]`；两人会话 `["uid", "peerUid"]`。
   */
  identity?: string[];
  /**
   * 页签默认标题，可用 `:name` 引用参数，如 `"用户详情 · :id"`。
   *
   * 页面加载完成后可以用 `useTabTitle()` 覆盖成更具体的名字。保留默认值是为了
   * **首帧和加载失败时页签也有名字** —— 只靠页面发布会退化成无名页签。
   */
  title?: string;
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
