import type { Metadata } from "next";
import { connection } from "next/server";
import { backendUrl } from "@neton/application-client-runtime/server";
import { PricingView, type PublicModel } from "@/components/pricing-view";
import { defaultLocaleMessage } from "@/messages";

// metadata 在服务端生成，取站点默认语言；页面正文在客户端按当前语言渲染（见 PricingView）。
export const metadata: Metadata = { title: defaultLocaleMessage("pricing.title") };
/** 按请求渲染、不先发静态外壳（Cache Components 下的阻塞路由，与控制台布局同一做法）。 */
export const instant = false;

/**
 * 公开价格页：未登录也能看，访客决定要不要注册之前最想知道的就是这个。放在 (auth) 组里：与登录注册页
 * 同一套外框（品牌、语言、样式），匿名可访问（src/proxy.ts 把 /pricing 排除在控制台登录拦截之外）。
 *
 * 数据来自网关的匿名接口 `/app/gateway/model/list`（只列有渠道承载且已定价的模型，价格是实际扣费的售价），
 * 由服务端直接取，不经过 /api/backend 代理。按请求渲染（`connection()`）：构建机通常连不上后端，
 * 不能把「价格暂时无法加载」烤进产物；取数结果按 60 秒缓存。
 */
async function loadModels(): Promise<PublicModel[] | null> {
  try {
    const res = await fetch(`${backendUrl()}/app/gateway/model/list`, { next: { revalidate: 60 } });
    const body = (await res.json()) as { code?: number; data?: PublicModel[] };
    return body.code === 0 && Array.isArray(body.data) ? body.data : null;
  } catch {
    return null;
  }
}

export default async function PricingPage() {
  await connection();
  const models = await loadModels();
  return <PricingView models={models} />;
}
