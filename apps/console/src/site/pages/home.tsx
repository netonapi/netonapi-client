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
const FEATURES = ["compat", "failover", "pricing", "usage"] as const;

/**
 * NetonAPI 产品首页（未登录也能看，可缓存、可收录）。已登录的用户从页头的「进入控制台」去 `/console`。
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
    const snippet = [
      "from openai import OpenAI",
      "",
      `client = OpenAI(base_url="${baseUrl}", api_key="sk-...")`,
      "reply = client.chat.completions.create(",
      '    model="gpt-4o-mini",',
      '    messages=[{"role": "user", "content": "Hello"}],',
      ")",
    ].join("\n");
    return (
      <div className="space-y-16 pb-10 pt-6 sm:pt-12">
        <section className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-semibold tracking-[-0.02em] sm:text-5xl">{t("home.hero.title")}</h1>
          <p className="mt-5 text-base leading-7 text-[var(--muted-foreground)] sm:text-lg">{t("home.hero.subtitle")}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href="/register" className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-[var(--primary-foreground)] transition hover:opacity-90">{t("home.hero.register")}</a>
            <a href="/pricing" className="rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm font-medium transition hover:border-[var(--primary)] hover:text-[var(--primary)]">{t("home.hero.pricing")}</a>
          </div>
          <p className="mt-4 text-xs text-[var(--muted-foreground)]">
            {t("home.hero.haveAccount")} <a href="/login" className="font-medium text-[var(--foreground)] underline-offset-4 hover:underline">{t("home.hero.login")}</a>
            {" · "}
            <a href={consoleHref("/", ctx.site.consoleBasePath)} className="font-medium text-[var(--foreground)] underline-offset-4 hover:underline">{t("home.hero.console")}</a>
          </p>
        </section>

        <section className="mx-auto max-w-3xl">
          <h2 className="text-xl font-semibold">{t("home.quickstart.title")}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{t("home.quickstart.body", { url: baseUrl })}</p>
          <pre className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-[13px] leading-6"><code>{snippet}</code></pre>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">{t("home.quickstart.sdks")}</p>
        </section>

        {data.models.length > 0 && (
          <section className="mx-auto max-w-3xl">
            <div className="flex items-end justify-between gap-4">
              <h2 className="text-xl font-semibold">{t("home.models.title")}</h2>
              <a href="/pricing" className="text-sm font-medium text-[var(--primary)] hover:underline">{t("home.models.all")}</a>
            </div>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">{t("home.models.unit")}</p>
            <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="border-b border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">{t("home.models.colModel")}</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">{t("home.models.colInput")}</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">{t("home.models.colOutput")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.models.map((m) => (
                    <tr key={m.model} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-2.5 font-medium">{m.displayName || m.model}</td>
                      {m.perRequestPrice != null
                        ? <td colSpan={2} className="px-4 py-2.5 tabular-nums">{t("home.models.perRequest", { price: (m.perRequestPrice / 1e6).toFixed(4) })}</td>
                        : <>
                          <td className="px-4 py-2.5 tabular-nums">{usd(m.inputPrice)}</td>
                          <td className="px-4 py-2.5 tabular-nums">{usd(m.outputPrice)}</td>
                        </>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <h2 className="sr-only">{t("home.features.title")}</h2>
          {FEATURES.map((key) => (
            <div key={key} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
              <h3 className="text-sm font-semibold">{t(`home.features.${key}.title`)}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{t(`home.features.${key}.body`)}</p>
            </div>
          ))}
        </section>
      </div>
    );
  },
});
