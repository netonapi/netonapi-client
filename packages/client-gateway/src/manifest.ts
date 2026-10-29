import { defineFrontModule } from "@neton/application-client-contract";

/** 用户控制台的 API 网关模块：工作台、自助 Key、用量账单、模型与价格。 */
export default defineFrontModule({
  id: "gateway",
  contractVersion: "1.1.0",
  locales: [
    { lang: "zh-CN", entry: "zh-CN" },
    { lang: "en-US", entry: "en-US" },
  ],
  // 控制台首页的中转站工作台：余额与消费、接入方式、近 7 天趋势、模型分布、最近调用（占满两列）
  slots: [
    { target: "console.home", id: "gateway.dashboard", entry: "dashboard", rendering: "client", order: 10 },
  ],
  pages: [
    { key: "gateway/key/index", path: "/gateway/key", entry: "my-keys", rendering: "client" },
    { key: "gateway/usage/index", path: "/gateway/usage", entry: "my-usage", rendering: "client" },
    { key: "gateway/model/index", path: "/gateway/model", entry: "model-catalog", rendering: "client" },
  ],
});
