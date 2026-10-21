import { PublicFrame } from "@/site/public-frame";

/**
 * 公开页面（门户）布局：匿名、可缓存、可收录（public-routes §2）。模块路由与 fork 页面由注册表
 * 生成在 `(modules)` / `(site)` 下；这里只挂外框。
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicFrame>{children}</PublicFrame>;
}
