import { Activity, Fingerprint, Gauge, KeyRound, Lock, RefreshCw, ScrollText, ShieldCheck, Sparkles, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { consoleHref, definePublicPage, jsonLd } from "@neton/application-client-runtime/public";

/** 公开模型列表里首页用到的字段（`/app/gateway/model/list`，价格是实际扣费的售价，USD / 1M tokens）。 */
interface HomeModel {
  model: string;
  displayName?: string | null;
  inputPrice: string;
  outputPrice: string;
  perRequestPrice?: number | null;
}

interface HomeData {
  /** 网关对外地址（运维配的 NETONAPI_PUBLIC_API_URL）；没配为 null，接入示例退回占位写法 */
  apiBase: string | null;
  models: HomeModel[];
}

/** 首页「热门模型」最多列几个；完整列表在价格页。 */
const FEATURED_LIMIT = 6;

/**
 * 两组卖点，每一条都对应系统里真实存在的能力（改文案前先核对）：
 * - 安全：TLS；上游凭证加密落库（GatewayCrypto）；API Key 只存哈希（keyHash）并可设额度 / 模型 / IP / 有效期；
 *   后台两步验证、IP 准入与操作审计。
 * - 稳定：失败自动重试并切换；Key 连续失败自动隔离；按 Key 的 RPM / TPM / 并发限制；原生流式。
 */
const SECURITY: Array<{ key: string; Icon: LucideIcon }> = [
  { key: "tls", Icon: Lock },
  { key: "vault", Icon: KeyRound },
  { key: "scoped", Icon: Fingerprint },
  { key: "audit", Icon: ScrollText },
];
const STABILITY: Array<{ key: string; Icon: LucideIcon }> = [
  { key: "failover", Icon: RefreshCw },
  { key: "health", Icon: Activity },
  { key: "limits", Icon: Gauge },
  { key: "stream", Icon: Zap },
];
const BILLING = ["usage", "reserve", "detail"] as const;

/**
 * NetonAPI 产品首页（未登录也能看，可缓存、可收录）。页头页脚是门户外壳（portal-shell.tsx），这里只画正文；
 * AI 风格的装饰类（ai-*）在 portal.css。
 *
 * 取数只用两个匿名接口：网关对外地址与公开模型列表。任一失败都不让首页出错——地址缺失时接入示例写占位，
 * 模型取不到时不显示「热门模型」区块。
 */
export default definePublicPage<HomeData>({
  async load(ctx) {
    const [info, models] = await Promise.all([
      ctx.backend.get<{ apiBase?: string | null }>("/app/gateway/public-info").catch(() => null),
      ctx.backend.get<HomeModel[]>("/app/gateway/model/list").catch(() => [] as HomeModel[]),
    ]);
    return {
      kind: "ok",
      data: { apiBase: info?.apiBase ?? null, models: Array.isArray(models) ? models.slice(0, FEATURED_LIMIT) : [] },
    };
  },

  seo(_data, ctx) {
    const url = ctx.site.origin;
    return {
      title: ctx.t("home.seo.title", { name: ctx.site.name }),
      titleAbsolute: true,
      description: ctx.t("home.seo.description"),
      openGraph: { type: "website" },
      jsonLd: [
        jsonLd.webSite({ name: ctx.site.name, url, inLanguage: ctx.locale }),
        jsonLd.organization({ name: ctx.site.name, url }),
      ],
    };
  },

  Page({ data, ctx }) {
    const { t } = ctx;
    const baseUrl = data.apiBase ? `${data.apiBase}/v1` : t("home.quickstart.placeholder");
    const usd = (v: string) => (v === "0" ? t("home.models.free") : `$${v}`);
    const consoleUrl = consoleHref("/", ctx.site.consoleBasePath);
    return (
      <div className="ai-surface -my-6">
        {/* 首屏 */}
        <section className="ai-hero px-4 pb-20 pt-16 sm:pt-24">
          <span className="ai-orb ai-orb-1" aria-hidden />
          <span className="ai-orb ai-orb-2" aria-hidden />
          <span className="ai-orb ai-orb-3" aria-hidden />
          <div className="mx-auto max-w-4xl text-center">
            <span className="ai-badge inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium">
              <span className="ai-badge-dot h-1.5 w-1.5 rounded-full" aria-hidden />
              {t("home.hero.badge")}
            </span>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-[-0.03em] sm:text-6xl">
              {t("home.hero.title")}
              <span className="ai-gradient-text block pb-1">{t("home.hero.titleAccent")}</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-[var(--muted-foreground)] sm:text-lg">{t("home.hero.subtitle")}</p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <a href="/register" className="ai-button inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold">
                <Sparkles size={16} aria-hidden />{t("home.hero.register")}
              </a>
              <a href="/pricing" className="inline-flex items-center rounded-xl border border-[var(--border)] bg-[var(--card)]/70 px-6 py-3 text-sm font-semibold backdrop-blur transition hover:border-[var(--primary)]">
                {t("home.hero.pricing")}
              </a>
            </div>
            <p className="mt-4 text-xs text-[var(--muted-foreground)]">
              {t("home.hero.haveAccount")} <a href="/login" className="font-medium text-[var(--foreground)] underline-offset-4 hover:underline">{t("home.hero.login")}</a>
              {" · "}
              <a href={consoleUrl} className="font-medium text-[var(--foreground)] underline-offset-4 hover:underline">{t("home.hero.console")}</a>
            </p>
            <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-[var(--muted-foreground)]">
              {(["tls", "compat", "payg"] as const).map((k) => (
                <li key={k} className="inline-flex items-center gap-1.5"><ShieldCheck size={14} className="text-emerald-500" aria-hidden />{t(`home.trust.${k}`)}</li>
              ))}
            </ul>
          </div>

          {/* 接入示例：终端窗口 */}
          <div className="mx-auto mt-14 max-w-3xl">
            <div className="ai-terminal overflow-hidden rounded-2xl text-left">
              <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" aria-hidden />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" aria-hidden />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" aria-hidden />
                <span className="ml-3 text-xs text-slate-400">quickstart.py</span>
              </div>
              <pre className="overflow-x-auto p-5 text-[13px] leading-6"><code>
                <span className="tok-k">from</span> openai <span className="tok-k">import</span> OpenAI{"\n\n"}
                client = <span className="tok-f">OpenAI</span>({"\n"}
                {"    "}base_url=<span className="tok-s">&quot;{baseUrl}&quot;</span>,{"\n"}
                {"    "}api_key=<span className="tok-s">&quot;sk-...&quot;</span>,  <span className="tok-c"># {t("home.quickstart.keyComment")}</span>{"\n"}
                ){"\n"}
                reply = client.chat.completions.<span className="tok-f">create</span>({"\n"}
                {"    "}model=<span className="tok-s">&quot;gpt-4o-mini&quot;</span>,{"\n"}
                {"    "}messages=[{"{"}<span className="tok-s">&quot;role&quot;</span>: <span className="tok-s">&quot;user&quot;</span>, <span className="tok-s">&quot;content&quot;</span>: <span className="tok-s">&quot;Hello&quot;</span>{"}"}],{"\n"}
                {"    "}stream=<span className="tok-k">True</span>,{"\n"}
                )
              </code></pre>
            </div>
            <p className="mt-3 text-center text-xs text-[var(--muted-foreground)]">{t("home.quickstart.body", { url: baseUrl })}</p>
          </div>
        </section>

        {/* 安全 */}
        <section className="px-4 py-16">
          <div className="mx-auto max-w-[1100px]">
            <SectionHeading eyebrow={t("home.security.eyebrow")} title={t("home.security.title")} body={t("home.security.body")} />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {SECURITY.map(({ key, Icon }) => <FeatureCard key={key} Icon={Icon} title={t(`home.security.${key}.title`)} body={t(`home.security.${key}.body`)} />)}
            </div>
          </div>
        </section>

        {/* 稳定 */}
        <section className="px-4 py-16">
          <div className="mx-auto max-w-[1100px]">
            <SectionHeading eyebrow={t("home.stability.eyebrow")} title={t("home.stability.title")} body={t("home.stability.body")} />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STABILITY.map(({ key, Icon }) => <FeatureCard key={key} Icon={Icon} title={t(`home.stability.${key}.title`)} body={t(`home.stability.${key}.body`)} />)}
            </div>
          </div>
        </section>

        {/* 计费 */}
        <section className="px-4 py-16">
          <div className="mx-auto max-w-[1100px]">
            <SectionHeading eyebrow={t("home.billing.eyebrow")} title={t("home.billing.title")} body={t("home.billing.body")} />
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {BILLING.map((k, i) => (
                <div key={k} className="ai-card rounded-2xl p-6">
                  <div className="ai-gradient-text text-3xl font-semibold tabular-nums">0{i + 1}</div>
                  <h3 className="mt-3 text-base font-semibold">{t(`home.billing.${k}.title`)}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{t(`home.billing.${k}.body`)}</p>
                </div>
              ))}
            </div>

            {data.models.length > 0 && (
              <div className="ai-card mt-10 overflow-hidden rounded-2xl">
                <div className="flex items-end justify-between gap-4 px-6 pt-5">
                  <div>
                    <h3 className="text-base font-semibold">{t("home.models.title")}</h3>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">{t("home.models.unit")}</p>
                  </div>
                  <a href="/pricing" className="text-sm font-medium text-[var(--primary)] hover:underline">{t("home.models.all")}</a>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[420px] text-left text-sm">
                    <thead className="border-y border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                      <tr>
                        <th scope="col" className="px-6 py-2.5 font-medium">{t("home.models.colModel")}</th>
                        <th scope="col" className="px-6 py-2.5 font-medium">{t("home.models.colInput")}</th>
                        <th scope="col" className="px-6 py-2.5 font-medium">{t("home.models.colOutput")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.models.map((m) => (
                        <tr key={m.model} className="border-b border-[var(--border)] last:border-0">
                          <td className="px-6 py-3 font-medium">{m.displayName || m.model}</td>
                          {m.perRequestPrice != null
                            ? <td colSpan={2} className="px-6 py-3 tabular-nums">{t("home.models.perRequest", { price: (m.perRequestPrice / 1e6).toFixed(4) })}</td>
                            : <>
                              <td className="px-6 py-3 tabular-nums">{usd(m.inputPrice)}</td>
                              <td className="px-6 py-3 tabular-nums">{usd(m.outputPrice)}</td>
                            </>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 结尾号召 */}
        <section className="px-4 pb-20 pt-8">
          <div className="ai-cta mx-auto max-w-[1100px] rounded-3xl px-8 py-14 text-center">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">{t("home.cta.title")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/80">{t("home.cta.body")}</p>
            <a href="/register" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-[#1e1b4b] transition hover:bg-white/90">
              <Sparkles size={16} aria-hidden />{t("home.cta.button")}
            </a>
          </div>
        </section>
      </div>
    );
  },
});

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="ai-gradient-text text-xs font-semibold uppercase tracking-[0.2em]">{eyebrow}</div>
      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em] sm:text-4xl">{title}</h2>
      <p className="mt-4 text-sm leading-7 text-[var(--muted-foreground)] sm:text-base">{body}</p>
    </div>
  );
}

function FeatureCard({ Icon, title, body }: { Icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="ai-card rounded-2xl p-6">
      <span className="ai-icon inline-flex h-10 w-10 items-center justify-center rounded-xl"><Icon size={20} aria-hidden /></span>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{body}</p>
    </div>
  );
}
