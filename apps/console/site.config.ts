import { defineSite } from "@neton/application-client-contract";

/**
 * 站点配置（public-routes §3）。纯静态数据：生成脚本在 Node 里 import 它，next.config 也读它。
 *
 * 底座缺省是「只有控制台」的产品形态：控制台在根路径、没有公开页面，与 1.0 的行为一致。
 * 内容类产品的 fork 在这里设 `consoleBasePath`（如 "/my"）、origin、公开页面与 SEO 配置。
 * 密钥（失效端点共享密钥、IndexNow key）不进这个文件，走环境变量。
 */
export default defineSite({
  origin: "http://localhost:3000",
  consoleBasePath: "/",
  locales: { default: "zh-CN", supported: ["zh-CN", "en-US"], prefix: "none" },
  // 后台「配置管理」的 system.site.name 优先；后端不可达或没配时用这里
  brand: { name: "NetonAPI" },
  auth: { loginMethods: ["password"] },
  // NetonAPI：控制台在根路径，公开价格页不需要登录（public-routes §2.1b；页面在 (auth) 路由组，不经受保护布局）
  anonymousPaths: ["/pricing"],
});
