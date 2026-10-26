import { definePublicPage } from "@neton/application-client-runtime/public";

/** 公开模型列表（`/app/gateway/model/list`）：只列有渠道承载且已定价的模型，价格是实际扣费的售价。 */
interface PriceModel {
  model: string;
  displayName?: string | null;
  inputPrice: string;
  outputPrice: string;
  cacheReadPrice: string;
  perRequestPrice?: number | null;
  capabilities?: string[];
  /** 长上下文分档：第一档就是表里的价格，之后每档是输入超过上一档门槛时的价格 */
  tiers?: { maxPromptTokens: number | null; input: string; output: string }[] | null;
}

/** 后端取不到时 models = null，页面显示「暂时无法加载」，不让整页出错。 */
interface PricingData { models: PriceModel[] | null }

const CAPABILITIES = new Set(["chat", "embeddings", "images", "audio", "rerank"]);

/**
 * 公开价格页（未登录也能看，可缓存、可收录）。门户页面：页头是门户外壳，登录状态与首页一致。
 * 之前放在 (auth) 组、自带静态页头，登录后页头仍显示「登录 / 注册」。
 */
export default definePublicPage<PricingData>({
  async load(ctx) {
    const models = await ctx.backend.get<PriceModel[]>("/app/gateway/model/list").catch(() => null);
    return { kind: "ok", data: { models: Array.isArray(models) ? models : null } };
  },

  seo(_data, ctx) {
    return { title: ctx.t("pricing.title"), description: ctx.t("pricing.intro"), openGraph: { type: "website" } };
  },

  Page({ data, ctx }) {
    const { t } = ctx;
    const usd = (v: string) => (v === "0" ? t("pricing.free") : `$${v}`);
    const capability = (c: string) => (CAPABILITIES.has(c) ? t(`capability.${c}`) : c);
    const tierLines = (m: PriceModel, field: "input" | "output") => (m.tiers ?? []).slice(1).map((tier, i) => (
      <div key={i} className="text-[11px] text-[var(--muted-foreground)]">{t("pricing.tierAbove", { tokens: ((m.tiers ?? [])[i]?.maxPromptTokens ?? 0).toLocaleString(), price: tier[field] })}</div>
    ));
    const models = data.models;
    return (
      <section className="mx-auto w-full max-w-[1080px] pb-10 pt-4">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{t("pricing.title")}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{t("pricing.intro")}</p>

        {models === null ? (
          <div className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted-foreground)]">{t("pricing.loadFailed")}</div>
        ) : models.length === 0 ? (
          <div className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted-foreground)]">{t("pricing.empty")}</div>
        ) : (
          <div className="mt-8 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">{t("pricing.colModel")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("pricing.colCapabilities")}</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">{t("pricing.colInput")}</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">{t("pricing.colOutput")}</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">{t("pricing.colCacheRead")}</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">{t("pricing.colPerRequest")}</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => {
                  const perRequest = m.perRequestPrice != null;
                  return (
                    <tr key={m.model} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-3">{m.displayName
                        ? <><div className="text-[13px] font-medium">{m.displayName}</div><code className="text-[11px] text-[var(--muted-foreground)]">{m.model}</code></>
                        : <span className="font-mono text-[13px]">{m.model}</span>}</td>
                      <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">{(m.capabilities ?? []).map(capability).join(" · ") || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{perRequest ? "—" : <>{usd(m.inputPrice)}{tierLines(m, "input")}</>}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{perRequest ? "—" : <>{usd(m.outputPrice)}{tierLines(m, "output")}</>}</td>
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
    );
  },
});
