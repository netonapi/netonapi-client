import { createVitalsHandler } from "@neton/application-client-runtime/public-server";

/**
 * 真实用户 Web Vitals 的收集端点（public-routes §10.7）：校验、按来源限流、每个指标一行 JSON 写进
 * `NETON_SITE_VITALS_LOG`（缺省标准输出）。站点配置 `vitals.endpoint = "/api/site/vitals"` 时由门户信标调用；
 * 产品也可以把 endpoint 指向自己的收集服务。`pnpm vitals:report <日志>` 算 p75 并按门槛判定。
 */
export const POST = createVitalsHandler();
