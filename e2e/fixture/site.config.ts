import { defineSite } from "@neton/application-client-contract";

/**
 * 底座端到端测试的站点配置（e2e/run.mts 经 NETON_SITE_CONFIG_FILE 选用；产品构建不读它）。
 * 门户形态：控制台在 /my、公开路由由夹具模块贡献、开着死链文件、站点 feed、签名媒体有效期、legacy 308 与 Web Vitals 上报。
 */
export default defineSite({
  origin: "https://www.fixture.example",
  consoleBasePath: "/my",
  locales: { default: "zh-CN", supported: ["zh-CN"], prefix: "none" },
  timeZone: "Asia/Shanghai",
  brand: { name: "Fixture" },
  auth: { loginMethods: ["password"] },
  routes: { legacy: { "fixture.item": ["/old-item/:id"] } },
  robots: { disallow: ["/find"], deadLinkFile: true },
  verification: { google: "g-fixture", baidu: "b-fixture", bing: "m-fixture" },
  feeds: { site: { title: "feed.site.title" } },
  media: { signedUrlValiditySeconds: 3600 },
  // 真实用户 Web Vitals：全部抽样，上报到底座自带的收集端点（e2e 把日志写到临时文件）
  vitals: { endpoint: "/api/site/vitals", sampleRate: 1 },
});
