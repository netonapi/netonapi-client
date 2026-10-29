"use client";

import * as React from "react";
import { apiFetch } from "@neton/application-client-runtime/client";
import { useFormat, useT } from "@neton/application-client-runtime/i18n";
import type { SiteSlotProps } from "@neton/application-client-runtime/public";
import { formatDateTime } from "@neton/application-client-runtime/types";
import { Button, KitLink, cn } from "@neton/application-client-kit";

interface Balance { balance: number; reserved: number; available: number }
interface PeriodStat { requests: number; errors: number; charged: number; promptTokens: number; completionTokens: number }
interface Stats {
  today: PeriodStat; period: PeriodStat; days: number;
  daily: { date: string; requests: number; charged: number }[];
  byModel: { model: string; requests: number; charged: number; promptTokens: number; completionTokens: number }[];
}
interface UsageLog { id: number; requestModel: string; promptTokens: number; completionTokens: number; charged: number; status: string; createdAt?: number | null }
interface Token { id: number; status: number }
interface PublicModel { model: string; displayName?: string | null; inputPrice: string; outputPrice: string; perRequestPrice?: number | null }

const DAYS = 7;
/** 可用余额低于 $1（μUSD）就提醒充值；为 0 时调用会被拒（402）。 */
const LOW_BALANCE = 1_000_000;
const TOP_MODELS = 5;

/** 一个接口一份状态：null = 加载中，"error" = 失败（只让用到它的那一块显示「—」，不拖垮整个工作台）。 */
function useLoad<T>(path: string): T | null | "error" {
  const [v, setV] = React.useState<T | null | "error">(null);
  React.useEffect(() => {
    let cancelled = false;
    apiFetch<T>(path).then((d) => { if (!cancelled) setV(d); }).catch(() => { if (!cancelled) setV("error"); });
    return () => { cancelled = true; };
  }, [path]);
  return v;
}
const ok = <T,>(v: T | null | "error"): v is T => v !== null && v !== "error";

/** μUSD → 美元：≥ $1 两位小数，不足 $1 四位（几分钱的调用也看得清）。 */
function usd(micro: number): string {
  const v = micro / 1_000_000;
  return `$${v.toFixed(Math.abs(v) >= 1 ? 2 : 4)}`;
}

/** 最近 [n] 个 UTC 日（汇总按 UTC 日切），没有调用的日子补 0：柱子按天连续，不会把空白日挤掉。 */
function lastDays(n: number, daily: Stats["daily"]): Stats["daily"] {
  const byDate = new Map(daily.map((d) => [d.date, d]));
  const out: Stats["daily"] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const key = d.toISOString().slice(0, 10);
    out.push(byDate.get(key) ?? { date: key, requests: 0, charged: 0 });
  }
  return out;
}

/** 卡片外壳：与控制台其它卡片同一套表面与内边距。 */
function Panel({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("front-surface min-w-0 rounded-xl p-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-base font-semibold text-[var(--foreground)]">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({ label, value, sub, href, linkText }: { label: string; value: string; sub?: React.ReactNode; href?: string; linkText?: string }) {
  return (
    <div className="front-surface flex min-w-0 flex-col rounded-xl p-5">
      <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
      <span className="mt-2 truncate text-xl font-semibold tabular-nums tracking-[-0.02em] text-[var(--foreground)] sm:text-2xl">{value}</span>
      <span className="mt-1 min-h-4 text-xs text-[var(--muted-foreground)]">{sub}</span>
      {href && linkText && <KitLink href={href} className="mt-3 text-xs font-medium text-[var(--gw-chart)] hover:underline">{linkText} →</KitLink>}
    </div>
  );
}

/** 近 7 天每日消费：单系列柱状图，悬停显示当天金额与请求数；另附一张只给读屏器的数据表。 */
function DailyChart({ points }: { points: Stats["daily"] }) {
  const t = useT("gateway");
  const { number: fmt } = useFormat();
  const [hover, setHover] = React.useState<number | null>(null);
  const w = 560, h = 150, top = 8, gap = 10;
  const max = Math.max(...points.map((p) => p.charged), 1);
  const bw = (w - gap * (points.length - 1)) / points.length;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h + 24}`} width="100%" role="img" aria-label={t("dashboard.trend.label")} className="overflow-visible">
        <line x1={0} x2={w} y1={h + 0.5} y2={h + 0.5} stroke="var(--border)" />
        {points.map((p, i) => {
          const x = i * (bw + gap);
          const bh = p.charged > 0 ? Math.max(3, Math.round(((h - top) * p.charged) / max)) : 0;
          return (
            <g key={p.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* 命中区比柱子大：整列都能触发提示 */}
              <rect x={x} y={0} width={bw} height={h} fill="transparent" />
              {bh > 0 && <path d={`M${x},${h} v${-(bh - 4)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${bh - 4} z`} fill="var(--gw-chart)" opacity={hover === null || hover === i ? 1 : 0.45} />}
              <text x={x + bw / 2} y={h + 17} fontSize={11} textAnchor="middle" fill="var(--muted-foreground)">{p.date.slice(5)}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className={cn("pointer-events-none absolute -top-2 z-10 -translate-y-full whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--popover,var(--card))] px-2.5 py-1.5 text-xs shadow-md",
          hover === 0 ? "translate-x-0" : hover === points.length - 1 ? "-translate-x-full" : "-translate-x-1/2")}
          style={{ left: hover === 0 ? 0 : hover === points.length - 1 ? "100%" : `${((hover * (bw + gap) + bw / 2) / w) * 100}%` }}>
          <div className="font-medium text-[var(--foreground)]">{points[hover].date}</div>
          <div className="tabular-nums text-[var(--muted-foreground)]">{t("dashboard.trend.tooltip", { cost: usd(points[hover].charged), requests: fmt(points[hover].requests) })}</div>
        </div>
      )}
      <table className="sr-only">
        <caption>{t("dashboard.trend.label")}</caption>
        <tbody>{points.map((p) => <tr key={p.date}><th scope="row">{p.date}</th><td>{usd(p.charged)}</td><td>{p.requests}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

/** 趋势卡片正文：柱状图 + 一行汇总（日均、消费最高的一天、总 tokens）。 */
function TrendBody({ stats }: { stats: Stats }) {
  const t = useT("gateway");
  const { number: fmt } = useFormat();
  const points = lastDays(DAYS, stats.daily);
  const peak = points.reduce((a, b) => (b.charged > a.charged ? b : a), points[0]);
  const items = [
    { label: t("dashboard.trend.avg"), value: usd(Math.round(stats.period.charged / DAYS)) },
    { label: t("dashboard.trend.peak"), value: peak.charged > 0 ? `${peak.date.slice(5)} · ${usd(peak.charged)}` : "—" },
    { label: t("dashboard.trend.tokens"), value: fmt(stats.period.promptTokens + stats.period.completionTokens) },
  ];
  return (
    <>
      <DailyChart points={points} />
      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-[var(--border)] pt-4">
        {items.map((it) => (
          <div key={it.label}>
            <dt className="text-xs text-[var(--muted-foreground)]">{it.label}</dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums text-[var(--foreground)]">{it.value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

/** 模型消费分布：横向条（比饼图好比大小），前 5 个之外合成「其他」。 */
function ModelShare({ rows }: { rows: Stats["byModel"] }) {
  const t = useT("gateway");
  const { number: fmt } = useFormat();
  const sorted = [...rows].sort((a, b) => b.charged - a.charged);
  const top = sorted.slice(0, TOP_MODELS);
  const rest = sorted.slice(TOP_MODELS);
  const items = rest.length
    ? [...top, { model: t("dashboard.models.other"), requests: rest.reduce((n, r) => n + r.requests, 0), charged: rest.reduce((n, r) => n + r.charged, 0), promptTokens: 0, completionTokens: 0 }]
    : top;
  const total = Math.max(items.reduce((n, r) => n + r.charged, 0), 1);
  return (
    <ul className="space-y-3">
      {items.map((r) => {
        const pct = (r.charged / total) * 100;
        return (
          <li key={r.model}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium text-[var(--foreground)]">{r.model}</span>
              <span className="shrink-0 tabular-nums text-xs text-[var(--muted-foreground)]">{t("dashboard.models.row", { cost: usd(r.charged), requests: fmt(r.requests), pct: pct.toFixed(pct < 10 ? 1 : 0) })}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--muted)]">
              <div className="h-full rounded-full bg-[var(--gw-chart)]" style={{ width: `${Math.max(pct, 1.5)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function CheckIcon({ done }: { done: boolean }) {
  return done ? (
    <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden><circle cx="10" cy="10" r="9" fill="currentColor" /><path d="M6 10.5l2.5 2.5L14 7.5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ) : (
    <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-[var(--muted-foreground)]" aria-hidden><circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
  );
}

/** 接入示例：OpenAI / Anthropic / curl 三种写法，地址用网关对外地址。 */
function Snippets({ base }: { base: string }) {
  const t = useT("gateway");
  const [tab, setTab] = React.useState<"openai" | "anthropic" | "curl">("openai");
  const code = {
    openai: `from openai import OpenAI\n\nclient = OpenAI(\n    base_url="${base}/v1",\n    api_key="sk-...",\n)\nreply = client.chat.completions.create(\n    model="gpt-4o-mini",\n    messages=[{"role": "user", "content": "Hello"}],\n)`,
    anthropic: `from anthropic import Anthropic\n\nclient = Anthropic(\n    base_url="${base}",\n    api_key="sk-...",\n)\nreply = client.messages.create(\n    model="claude-sonnet-4",\n    max_tokens=1024,\n    messages=[{"role": "user", "content": "Hello"}],\n)`,
    curl: `curl ${base}/v1/chat/completions \\\n  -H "Authorization: Bearer sk-..." \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hello"}]}'`,
  }[tab];
  return (
    <div className="mt-4">
      <div role="tablist" className="flex gap-1 text-xs">
        {(["openai", "anthropic", "curl"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn("rounded-md px-2.5 py-1 font-medium transition", tab === k ? "bg-[var(--muted)] text-[var(--foreground)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]")}>
            {t(`dashboard.snippet.${k}`)}
          </button>
        ))}
      </div>
      <pre className="mt-2 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3 text-[12px] leading-5 text-[var(--foreground)]"><code>{code}</code></pre>
    </div>
  );
}

/**
 * 中转站的工作台（`console.home`）：余额与消费、接入方式、近 7 天趋势、模型分布、最近调用。
 * 每块各自取数、各自出错；新用户（还没充值 / 建 Key / 调用过）先看到三步引导与推荐模型。
 * 占满控制台首页网格的两列。
 */
export default function GatewayDashboard(_: SiteSlotProps) {
  const t = useT("gateway");
  const { number: fmt } = useFormat();
  const balance = useLoad<Balance>("/app/gateway/usage/balance");
  const stats = useLoad<Stats>(`/app/gateway/usage/stats?days=${DAYS}`);
  const tokens = useLoad<Token[]>("/app/gateway/token/list");
  const logs = useLoad<{ list: UsageLog[]; total: number }>("/app/gateway/usage/log/page?pageNo=1&pageSize=6");
  const info = useLoad<{ apiBase?: string | null }>("/app/gateway/public-info");
  const catalog = useLoad<PublicModel[]>("/app/gateway/model/list");
  const [copied, setCopied] = React.useState(false);

  const dash = (v: unknown) => (v === null ? "…" : "—");
  const base = ok(info) && info.apiBase ? info.apiBase : null;
  const activeKeys = ok(tokens) ? tokens.filter((k) => k.status === 1).length : null;
  const steps = [
    { key: "recharge", done: ok(balance) && (balance.balance > 0 || (ok(stats) && stats.period.requests > 0)), href: "/payment/billing" },
    { key: "key", done: ok(tokens) && tokens.length > 0, href: "/gateway/key" },
    { key: "call", done: ok(logs) && logs.total > 0, href: "/gateway/model" },
  ];
  const onboarding = ok(balance) && ok(tokens) && ok(logs) && steps.some((s) => !s.done);
  const p = ok(stats) ? stats.period : null;
  const successRate = p && p.requests > 0 ? ((p.requests - p.errors) / p.requests) * 100 : null;

  async function copyBase() {
    if (!base) return;
    await navigator.clipboard?.writeText(`${base}/v1`).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="min-w-0 space-y-5 lg:col-span-2 [--gw-chart:#4f46e5] [.dark_&]:[--gw-chart:#6366f1]" data-overview="gateway">
      {/* 余额提醒：低于 $1 才出现 */}
      {ok(balance) && balance.available < LOW_BALANCE && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm text-amber-900 [.dark_&]:border-amber-500/40 [.dark_&]:bg-amber-500/10 [.dark_&]:text-amber-200">
          <span className="flex items-center gap-2">
            <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" aria-hidden><path d="M10 2l8.5 15h-17z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M10 8v4M10 14.5v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            {balance.available <= 0 ? t("dashboard.lowBalance.empty") : t("dashboard.lowBalance.low", { balance: usd(balance.available) })}
          </span>
          <KitLink href="/payment/billing" className="font-semibold underline-offset-4 hover:underline">{t("dashboard.recharge")}</KitLink>
        </div>
      )}

      {/* 关键数字 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={t("dashboard.stat.balance")} value={ok(balance) ? usd(balance.available) : dash(balance)}
          sub={ok(balance) && balance.reserved > 0 ? t("dashboard.stat.reserved", { amount: usd(balance.reserved) }) : null}
          href="/payment/billing" linkText={t("dashboard.recharge")} />
        <Stat label={t("dashboard.stat.today")} value={ok(stats) ? usd(stats.today.charged) : dash(stats)}
          sub={ok(stats) ? t("dashboard.stat.todaySub", { requests: fmt(stats.today.requests), tokens: fmt(stats.today.promptTokens + stats.today.completionTokens) }) : null} />
        <Stat label={t("dashboard.stat.week")} value={p ? usd(p.charged) : dash(stats)}
          sub={p ? t("dashboard.stat.weekSub", { requests: fmt(p.requests) }) : null}
          href="/gateway/usage" linkText={t("dashboard.stat.usageLink")} />
        <Stat label={t("dashboard.stat.success")} value={successRate === null ? (p ? "—" : dash(stats)) : `${successRate.toFixed(successRate >= 99.95 || successRate < 10 ? 0 : 1)}%`}
          sub={p ? (p.requests > 0 ? t("dashboard.stat.successSub", { errors: fmt(p.errors) }) : t("dashboard.stat.noCalls")) : null} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 接入：新用户三步引导；之后是 API 地址与示例 */}
        <Panel title={onboarding ? t("dashboard.start.title") : t("dashboard.api.title")}
          action={<KitLink href="/gateway/key" className="text-xs font-medium text-[var(--gw-chart)] hover:underline">{activeKeys === null ? t("dashboard.api.keys") : t("dashboard.api.keysCount", { count: activeKeys })}</KitLink>}>
          {onboarding && (
            <ol className="mb-4 space-y-2">
              {steps.map((s, i) => (
                <li key={s.key} className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2.5">
                  <CheckIcon done={s.done} />
                  <span className={cn("flex-1 text-sm", s.done ? "text-[var(--muted-foreground)] line-through" : "text-[var(--foreground)]")}>{i + 1}. {t(`dashboard.start.${s.key}`)}</span>
                  {!s.done && <KitLink href={s.href} className="text-xs font-medium text-[var(--gw-chart)] hover:underline">{t(`dashboard.start.${s.key}Action`)}</KitLink>}
                </li>
              ))}
            </ol>
          )}
          <div className="text-xs text-[var(--muted-foreground)]">{t("dashboard.api.baseUrl")}</div>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-sm text-[var(--foreground)]">{base ? `${base}/v1` : ok(info) ? t("dashboard.api.notConfigured") : "…"}</code>
            <Button variant="outline" disabled={!base} onClick={() => void copyBase()}>{copied ? t("dashboard.api.copied") : t("dashboard.api.copy")}</Button>
          </div>
          {base && <Snippets base={base} />}
        </Panel>

        {/* 近 7 天消费趋势 */}
        <Panel title={t("dashboard.trend.title")} action={<KitLink href="/gateway/usage" className="text-xs font-medium text-[var(--gw-chart)] hover:underline">{t("dashboard.more")}</KitLink>}>
          {ok(stats) ? (
            stats.period.requests > 0 ? <TrendBody stats={stats} /> : <p className="py-10 text-center text-sm text-[var(--muted-foreground)]">{t("dashboard.trend.empty")}</p>
          ) : <p className="py-10 text-center text-sm text-[var(--muted-foreground)]">{dash(stats)}</p>}
        </Panel>

        {/* 模型：用过的按消费分布；新用户看推荐模型与价格 */}
        {ok(stats) && stats.byModel.length > 0 ? (
          <Panel title={t("dashboard.models.title")} action={<KitLink href="/gateway/model" className="text-xs font-medium text-[var(--gw-chart)] hover:underline">{t("dashboard.models.prices")}</KitLink>}>
            <ModelShare rows={stats.byModel} />
          </Panel>
        ) : (
          <Panel title={t("dashboard.models.featured")} action={<KitLink href="/gateway/model" className="text-xs font-medium text-[var(--gw-chart)] hover:underline">{t("dashboard.models.prices")}</KitLink>}>
            {ok(catalog) && catalog.length > 0 ? (
              <ul className="divide-y divide-[var(--border)]">
                {catalog.slice(0, 6).map((m) => (
                  <li key={m.model} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="truncate font-medium text-[var(--foreground)]">{m.displayName || m.model}</span>
                    <span className="shrink-0 tabular-nums text-xs text-[var(--muted-foreground)]">
                      {m.perRequestPrice != null ? t("dashboard.models.perRequest", { price: (m.perRequestPrice / 1e6).toFixed(4) }) : t("dashboard.models.price", { input: m.inputPrice, output: m.outputPrice })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="py-6 text-sm text-[var(--muted-foreground)]">{ok(catalog) ? t("dashboard.models.none") : dash(catalog)}</p>}
          </Panel>
        )}

        {/* 最近调用 */}
        <Panel title={t("dashboard.recent.title")} action={<KitLink href="/gateway/usage" className="text-xs font-medium text-[var(--gw-chart)] hover:underline">{t("dashboard.more")}</KitLink>}>
          {ok(logs) && logs.list.length > 0 ? (
            <ul className="divide-y divide-[var(--border)]">
              {logs.list.map((l) => {
                const good = l.status === "ok";
                return (
                  <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px]", good ? "bg-emerald-500/10 text-emerald-600 [.dark_&]:text-emerald-400" : "bg-red-500/10 text-red-600 [.dark_&]:text-red-400")}>
                      <span aria-hidden>{good ? "✓" : "!"}</span>{t(t.has(`usage.status.${l.status}`) ? `usage.status.${l.status}` : "usage.status.error")}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-[var(--foreground)]">{l.requestModel}</span>
                    <span className="hidden shrink-0 tabular-nums text-xs text-[var(--muted-foreground)] sm:inline">{t("dashboard.recent.tokens", { tokens: fmt(l.promptTokens + l.completionTokens) })}</span>
                    <span className="w-20 shrink-0 text-right tabular-nums text-[var(--foreground)]">{usd(l.charged)}</span>
                    <span className="hidden w-32 shrink-0 text-right text-xs text-[var(--muted-foreground)] md:inline">{formatDateTime(l.createdAt)}</span>
                  </li>
                );
              })}
            </ul>
          ) : <p className="py-6 text-sm text-[var(--muted-foreground)]">{ok(logs) ? t("dashboard.recent.empty") : dash(logs)}</p>}
        </Panel>
      </div>
    </div>
  );
}
