"use client";

import { useT } from "@neton/application-client-runtime/i18n";
import { BrandMark } from "@/components/brand-mark";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { useSiteBrand } from "@/components/site-brand";

export interface PublicModel {
  displayName?: string | null;
  tiers?: { maxPromptTokens: number | null; input: string; output: string }[] | null;
  model: string;
  inputPrice: string;
  outputPrice: string;
  cacheReadPrice: string;
  perRequestPrice?: number | null;
  capabilities?: string[];
}

const CAPABILITIES = new Set(["chat", "embeddings", "images", "audio", "rerank"]);

/** 公开价格页正文（客户端组件，好跟随当前语言）；数据由服务端页面取好传进来，null 表示加载失败。 */
export function PricingView({ models }: { models: PublicModel[] | null }) {
  const brand = useSiteBrand();
  const t = useT("console");
  const usd = (value: string) => (value === "0" ? t("pricing.free") : `$${value}`);
  // 长上下文分档：第一档就是表里的价格，之后每档标出输入超过多少 tokens 时的价格
  const tierLines = (m: PublicModel, field: "input" | "output") => (m.tiers ?? []).slice(1).map((tier, i) => (
    <div key={i} className="text-[11px] text-[var(--muted-foreground)]">{t("pricing.tierAbove", { tokens: ((m.tiers ?? [])[i]?.maxPromptTokens ?? 0).toLocaleString(), price: tier[field] })}</div>
  ));
  const capability = (c: string) => (CAPABILITIES.has(c) ? t(`capability.${c}`) : c);
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
          <LocaleSwitcher />
          <a href="/login" className="rounded-lg px-3 py-2 text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]">{t("pricing.login")}</a>
          <a href="/register" className="rounded-lg bg-[var(--primary)] px-3.5 py-2 font-medium text-[var(--primary-foreground)] transition hover:opacity-90">{t("pricing.register")}</a>
        </nav>
      </header>

      <section className="mx-auto w-full max-w-[1080px] px-5 pb-16 pt-6 sm:px-8">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{t("pricing.title")}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          {t("pricing.intro")}
        </p>

        {models === null ? (
          <div className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted-foreground)]">{t("pricing.loadFailed")}</div>
        ) : models.length === 0 ? (
          <div className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted-foreground)]">{t("pricing.empty")}</div>
        ) : (
          <div className="mt-8 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-4 py-3 font-medium">{t("pricing.colModel")}</th>
                  <th className="px-4 py-3 font-medium">{t("pricing.colCapabilities")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("pricing.colInput")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("pricing.colOutput")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("pricing.colCacheRead")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("pricing.colPerRequest")}</th>
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

      <footer className="mx-auto flex h-[52px] w-full max-w-[1280px] items-center justify-between px-5 text-[10px] text-[var(--muted-foreground)] sm:px-8">
        <span>© {new Date().getFullYear()} {brand.name}</span>
        <span className="tracking-[0.08em]">{brand.tagline}</span>
      </footer>
    </main>
  );
}
