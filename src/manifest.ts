import { defineFrontModule } from "@neton/application-client-contract";

/** NewGate 用户控制台的 API 网关模块：自助 Key、用量账单、模型与价格。 */
export default defineFrontModule({
  id: "gateway",
  contractVersion: "1.0.0",
  pages: [
    { key: "gateway/key/index", path: "/gateway/key", entry: "my-keys", rendering: "client" },
    { key: "gateway/usage/index", path: "/gateway/usage", entry: "my-usage", rendering: "client" },
    { key: "gateway/model/index", path: "/gateway/model", entry: "model-catalog", rendering: "client" },
  ],
});
