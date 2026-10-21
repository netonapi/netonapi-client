import type { BundleBudget } from "../../scripts/budget/measure.mts";

/**
 * 首屏 JS 预算（public-routes §10.6），KB（1024 字节）gzip；`next build` 之后由 postbuild 检查，超出即构建失败。
 *
 * 框架底数（react-dom + Next 路由 + React + Turbopack 运行时，每页都加载）单独设上限；每个路由只卡它
 * 自己的 JS（布局、外壳、客户端岛）。产品 fork 按自己的页面在 `routes` 里收紧或放宽。
 *
 * 底座实测（Next 16.4 + React 19.3，Turbopack）：框架底数 128.8 KB，公开路由自身 8.1 KB。
 * 框架上限留约 5% 给补丁升级；超了先看是不是根布局多引了东西，再决定是否随框架升级调高（写明证据）。
 */
const budget: BundleBudget = {
  shared: 135,
  public: 20,
  routes: {},
};

export default budget;
