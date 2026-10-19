import type { Metadata } from "next";
import { backendUrl } from "@neton/application-client-runtime/server";
import { BrandMark } from "@/components/brand-mark";
import { getSiteBrand } from "@/lib/site-brand";

export const metadata: Metadata = { title: "模型价格" };
// 不在构建期预渲染：构建机通常连不上后端，烤进产物的会是「价格暂时无法加载」。数据本身仍按 60 秒缓存。
export const dynamic = "force-dynamic";

interface PublicModel {
  model: string;
  inputPrice: string;
  outputPrice: string;
  cacheReadPrice: string;
  perRequestPrice?: number | null;
  capabilities?: string[];
}

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

const CAPABILITY_LABEL: Record<string, string> = { chat: "对话", embeddings: "向量", images: "图像", audio: "语音", rerank: "重排" };

function usd(value: string): string {
  return value === "0" ? "免费" : `$${value}`;
}

export default async function PricingPage() {
  const [brand, models] = await Promise.all([getSiteBrand(), loadModels()]);
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="mx-auto flex h-20 w-full max-w-[1280px] items-center justify-between px-5 sm:px-8">
        <a href="/" className="flex items-center gap-3">
          <BrandMark className="h-10 w-10" />
          <div>
            <div className="text-sm font-semibold tracking-[-0.01em]">{brand.name}</div>
            {brand.tagline && <div className="mt-0.5 text-[10px] font-medium tracking-[0.18em] text-[var(--muted-foreground)]">{brand.tagline}</div>}
          </div>
        </a>
        <nav className="flex items-center gap-2 text-sm">
          <a href="/login" className="rounded-lg px-3 py-2 text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]">登录</a>
          <a href="/register" className="rounded-lg bg-[var(--primary)] px-3.5 py-2 font-medium text-[var(--primary-foreground)] transition hover:opacity-90">注册</a>
        </nav>
      </header>

      <section className="mx-auto w-full max-w-[1080px] px-5 pb-16 pt-6 sm:px-8">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">模型价格</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          按实际用量计费，价格以美元 / 每百万 tokens 计；按次计价的模型单独标注。下面就是调用时实际扣费的价格。
        </p>

        {models === null ? (
          <div className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted-foreground)]">价格暂时无法加载，请稍后刷新。</div>
        ) : models.length === 0 ? (
          <div className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted-foreground)]">暂无可用模型。</div>
        ) : (
          <div className="mt-8 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-4 py-3 font-medium">模型</th>
                  <th className="px-4 py-3 font-medium">能力</th>
                  <th className="px-4 py-3 text-right font-medium">输入 / 1M</th>
                  <th className="px-4 py-3 text-right font-medium">输出 / 1M</th>
                  <th className="px-4 py-3 text-right font-medium">缓存读取 / 1M</th>
                  <th className="px-4 py-3 text-right font-medium">按次</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => {
                  const perRequest = m.perRequestPrice != null;
                  return (
                    <tr key={m.model} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-3 font-mono text-[13px]">{m.model}</td>
                      <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">{(m.capabilities ?? []).map((c) => CAPABILITY_LABEL[c] ?? c).join(" · ") || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{perRequest ? "—" : usd(m.inputPrice)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{perRequest ? "—" : usd(m.outputPrice)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{perRequest || m.cacheReadPrice === "0" ? "—" : `$${m.cacheReadPrice}`}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{perRequest ? `$${(m.perRequestPrice! / 1_000_000).toFixed(4)}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="mx-auto flex h-[52px] w-full max-w-[1280px] items-center justify-between px-5 text-[10px] text-[var(--muted-foreground)] sm:px-8">
        <span>© {new Date().getFullYear()} {brand.name}</span>
        <span className="tracking-[0.08em]">{brand.tagline}</span>
      </footer>
    </main>
  );
}
