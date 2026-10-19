"use client";

import * as React from "react";
import { apiFetch } from "@neton/application-client-runtime/client";
import { useDescribeError } from "@neton/application-client-runtime/errors";
import { useFormat, useT } from "@neton/application-client-runtime/i18n";
import { useQuery } from "@neton/application-client-runtime/client-context";
import { formatDateTime } from "@neton/application-client-runtime/types";
import {
  Button, Card, CardContent, CardHeader, CardTitle,
  DataTable, Field, Input, PageHeader, Pagination, type DataColumn,
} from "@neton/application-client-kit";

interface Balance { balance: number; reserved: number; available: number }
interface UsageLog {
  id: number; requestModel: string; promptTokens: number; completionTokens: number;
  cacheReadTokens: number; charged: number; status: string; errorCode?: string | null;
  stream: number; latencyMs?: number | null; createdAt?: number | null;
}
interface PageResp<T> { list: T[]; total: number; page: number; size: number; totalPages: number }
interface PeriodStat { requests: number; errors: number; charged: number; promptTokens: number; completionTokens: number }
interface Stats {
  today: PeriodStat; period: PeriodStat; days: number;
  daily: { date: string; requests: number; charged: number }[];
  byModel: { model: string; requests: number; charged: number; promptTokens: number; completionTokens: number }[];
  byToken: { tokenId: number; name: string; requests: number; charged: number }[];
}

/** 额度 μUSD（1e-6 USD）转成美元展示，避免用户对着 7 位整数猜。 */
const usd = (micro: number) => `$${(micro / 1_000_000).toFixed(4)}`;

/** 纯 SVG 柱状图，够看趋势就行。 */
function BarChart({ points, valueOf, format }: { points: Stats["daily"]; valueOf: (d: Stats["daily"][number]) => number; format: (n: number) => string }) {
  const t = useT("gateway");
  if (points.length === 0) return <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{t("usage.no_data")}</p>;
  const w = 720, h = 120, pad = 24, bw = Math.max(4, (w - pad * 2) / points.length - 4);
  const max = Math.max(1, ...points.map(valueOf));
  return (
    <svg viewBox={`0 0 ${w} ${h + 28}`} width="100%" height={h + 28} role="img" aria-label={t("usage.chart_label")}>
      {points.map((p, i) => {
        const v = valueOf(p); const bh = Math.round((v / max) * h);
        const x = pad + i * ((w - pad * 2) / points.length);
        return (
          <g key={p.date}>
            <rect x={x} y={h - bh} width={bw} height={bh} rx={2} fill="currentColor" opacity={0.7}><title>{`${p.date}: ${format(v)}`}</title></rect>
            {points.length <= 31 || i % 7 === 0 ? <text x={x + bw / 2} y={h + 16} fontSize={10} textAnchor="middle" fill="currentColor" opacity={0.6}>{p.date.slice(5)}</text> : null}
          </g>
        );
      })}
    </svg>
  );
}

export default function Page() {
  const describeError = useDescribeError("gateway");
  const t = useT("gateway");
  const { number: fmt } = useFormat();
  // 调用状态 → 词条 usage.status.<status>；未知状态原样显示
  const statusLabel = (s: string) => (t.has(`usage.status.${s}`) ? t(`usage.status.${s}`) : s);
  const [days, setDays] = React.useState(7);
  const [page, setPage] = React.useState(1);
  const [model, setModel] = React.useState("");
  const [modelInput, setModelInput] = React.useState("");
  const size = 20;

  // useQuery 而不是 effect 里取数：工作区切回页签会重挂 effect，那样每次切换都整页重拉、表格先清空。
  // 翻页 / 筛选时 placeholderData 保留上一页，不闪空表。
  const balanceQ = useQuery({ queryKey: ["gateway-balance"], queryFn: () => apiFetch<Balance>("/app/gateway/usage/balance") });
  const logsQ = useQuery({
    queryKey: ["gateway-usage-logs", page, model],
    queryFn: () => apiFetch<PageResp<UsageLog>>(`/app/gateway/usage/log/page?pageNo=${page}&pageSize=${size}${model ? `&requestModel=${encodeURIComponent(model)}` : ""}`),
    placeholderData: (prev) => prev,
  });
  const statsQ = useQuery({
    queryKey: ["gateway-usage-stats", days],
    queryFn: () => apiFetch<Stats>(`/app/gateway/usage/stats?days=${days}`),
    placeholderData: (prev) => prev,
  });
  const balance = balanceQ.data ?? null;
  const stats = statsQ.data ?? null;
  const rows = logsQ.data?.list ?? [];
  const total = logsQ.data?.total ?? 0;
  const loading = logsQ.isLoading || balanceQ.isLoading;
  const firstError = balanceQ.error ?? logsQ.error ?? statsQ.error;
  const error = firstError ? describeError(firstError) : null;

  const columns: DataColumn<UsageLog>[] = [
    { key: "createdAt", header: t("usage.col.time"), cell: (r) => formatDateTime(r.createdAt) },
    { key: "requestModel", header: t("usage.col.model"), cell: (r) => r.requestModel },
    { key: "promptTokens", header: t("usage.col.input"), cell: (r) => r.cacheReadTokens > 0 ? t("usage.input_cached", { prompt: r.promptTokens, cache: r.cacheReadTokens }) : r.promptTokens },
    { key: "completionTokens", header: t("usage.col.output"), cell: (r) => r.completionTokens },
    { key: "charged", header: t("usage.col.cost"), cell: (r) => usd(r.charged) },
    { key: "latencyMs", header: t("usage.col.latency"), cell: (r) => (r.latencyMs != null ? `${(r.latencyMs / 1000).toFixed(1)}s` : "—") },
    { key: "stream", header: t("usage.col.stream"), cell: (r) => (r.stream === 1 ? t("usage.yes") : t("usage.no")) },
    { key: "status", header: t("usage.col.status"), cell: (r) => (r.errorCode ? t("usage.status_with_code", { status: statusLabel(r.status), code: r.errorCode }) : statusLabel(r.status)) },
  ];
  const modelCols: DataColumn<Stats["byModel"][number]>[] = [
    { key: "model", header: t("usage.col.model"), cell: (r) => r.model },
    { key: "requests", header: t("usage.col.requests"), cell: (r) => fmt(r.requests) },
    { key: "tokens", header: t("usage.col.tokens"), cell: (r) => `${fmt(r.promptTokens)} / ${fmt(r.completionTokens)}` },
    { key: "charged", header: t("usage.col.cost"), cell: (r) => usd(r.charged) },
  ];
  const tokenCols: DataColumn<Stats["byToken"][number]>[] = [
    { key: "name", header: "Key", cell: (r) => r.name || `#${r.tokenId}` },
    { key: "requests", header: t("usage.col.requests"), cell: (r) => fmt(r.requests) },
    { key: "charged", header: t("usage.col.cost"), cell: (r) => usd(r.charged) },
  ];

  const grid = (n: number): React.CSSProperties => ({ display: "grid", gridTemplateColumns: `repeat(${n}, minmax(0,1fr))`, gap: 12 });
  const hint: React.CSSProperties = { fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="USAGE" title={t("usage.title")} description={t("usage.description")} />
      {error ? <p role="alert">{error}</p> : null}

      <div style={grid(3)}>
        <Card>
          <CardHeader><CardTitle>{t("usage.available")}</CardTitle></CardHeader>
          <CardContent>{balance ? usd(balance.available) : "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("usage.today")}</CardTitle></CardHeader>
          <CardContent>
            {stats ? usd(stats.today.charged) : "—"}
            {stats ? <div style={hint}>{t(stats.today.errors > 0 ? "usage.today_summary_errors" : "usage.today_summary", { requests: stats.today.requests, tokens: fmt(stats.today.promptTokens + stats.today.completionTokens), errors: stats.today.errors })}</div> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("usage.period", { days })}</CardTitle></CardHeader>
          <CardContent>
            {stats ? usd(stats.period.charged) : "—"}
            {stats ? <div style={hint}>{t("usage.period_summary", { requests: stats.period.requests, reserved: balance ? usd(balance.reserved) : "—" })}</div> : null}
          </CardContent>
        </Card>
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        {[7, 30, 90].map((n) => <Button key={n} variant={days === n ? "default" : "outline"} onClick={() => setDays(n)}>{t("usage.last_days", { days: n })}</Button>)}
      </div>
      <Card>
        <CardHeader><CardTitle>{t("usage.daily")}</CardTitle></CardHeader>
        <CardContent><BarChart points={stats?.daily ?? []} valueOf={(x) => x.charged} format={usd} /></CardContent>
      </Card>
      <div style={grid(2)}>
        <Card>
          <CardHeader><CardTitle>{t("usage.by_model")}</CardTitle></CardHeader>
          <CardContent><DataTable columns={modelCols} rows={stats?.byModel ?? []} rowKey={(r) => r.model} loading={!stats} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("usage.by_key")}</CardTitle></CardHeader>
          <CardContent><DataTable columns={tokenCols} rows={stats?.byToken ?? []} rowKey={(r) => r.tokenId} loading={!stats} /></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("usage.logs")}</CardTitle></CardHeader>
        <CardContent>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 8 }}>
            <Field label={t("usage.filter_model")}><Input value={modelInput} onChange={(e) => setModelInput(e.target.value)} placeholder={t("usage.filter_placeholder")} /></Field>
            <Button variant="outline" onClick={() => { setPage(1); setModel(modelInput.trim()); }}>{t("usage.filter")}</Button>
            {model ? <Button variant="ghost" onClick={() => { setModelInput(""); setModel(""); setPage(1); }}>{t("usage.clear")}</Button> : null}
          </div>
          <DataTable columns={columns} rows={rows} loading={loading} rowKey={(r) => r.id} />
          <Pagination
            page={page}
            pageSize={size}
            total={total}
            loading={loading}
            onPageChange={setPage}
            onPageSizeChange={() => { /* 固定每页条数，暂不开放调整 */ }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
