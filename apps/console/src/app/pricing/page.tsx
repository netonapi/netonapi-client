import type { Metadata } from "next";
import { backendUrl } from "@neton/application-client-runtime/server";
import { PricingView, type PublicModel } from "@/components/pricing-view";
import { defaultLocaleMessage } from "@/messages";

// metadata 在服务端生成，取默认语言；页面正文在客户端按当前语言渲染（见 PricingView）。
export const metadata: Metadata = { title: defaultLocaleMessage("pricing.title") };
// 不在构建期预渲染：构建机通常连不上后端，烤进产物的会是「价格暂时无法加载」。数据本身仍按 60 秒缓存。
export const dynamic = "force-dynamic";

/**
 * 公开价格页：未登录也能看，访客决定要不要注册之前最想知道的就是这个。
 * 数据来自网关的匿名接口 `/app/gateway/model/list`（只列有渠道承载且已定价的模型，价格是实际扣费的售价），
 * 由服务端直接取，不经过要求会话的 /api/backend 代理。缓存 60 秒。
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
  const models = await loadModels();
  return <PricingView models={models} />;
}
