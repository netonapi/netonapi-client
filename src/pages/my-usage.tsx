"use client";

import * as React from "react";
import { apiFetch } from "@neton/application-client-runtime/client";
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
const fmt = (n: number) => n.toLocaleString("zh-CN");
const STATUS_LABEL: Record<string, string> = { ok: "成功", partial: "未完整", error: "失败" };

export default function Page() {
  const [balance, setBalance] = React.useState<Balance | null>(null);
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [days, setDays] = React.useState(7);
  const [rows, setRows] = React.useState<UsageLog[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [model, setModel] = React.useState("");
  const [modelInput, setModelInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const size = 20;

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const q = model ? `&requestModel=${encodeURIComponent(model)}` : "";
      const [b, p] = await Promise.all([
        apiFetch<Balance>("/app/gateway/usage/balance"),
        apiFetch<PageResp<UsageLog>>(`/app/gateway/usage/log/page?pageNo=${page}&pageSize=${size}${q}`),
      ]);
      setBalance(b); setRows(p.list); setTotal(p.total);
    } catch (cause) { setError((cause as Error).message); } finally { setLoading(false); }
  }, [page, model]);

  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    let alive = true;
    apiFetch<Stats>(`/app/gateway/usage/stats?days=${days}`).then((s) => { if (alive) setStats(s); }).catch((cause) => { if (alive) setError((cause as Error).message); });
    return () => { alive = false; };
  }, [days]);

  const columns: DataColumn<UsageLog>[] = [
    { key: "createdAt", header: "时间", cell: (r) => formatDateTime(r.createdAt) },
    { key: "requestModel", header: "模型", cell: (r) => r.requestModel },
    { key: "promptTokens", header: "输入", cell: (r) => r.cacheReadTokens > 0 ? `${r.promptTokens}（缓存 ${r.cacheReadTokens}）` : r.promptTokens },
    { key: "completionTokens", header: "输出", cell: (r) => r.completionTokens },
    { key: "charged", header: "费用", cell: (r) => usd(r.charged) },
    { key: "latencyMs", header: "耗时", cell: (r) => (r.latencyMs != null ? `${(r.latencyMs / 1000).toFixed(1)}s` : "—") },
    { key: "stream", header: "流式", cell: (r) => (r.stream === 1 ? "是" : "否") },
    { key: "status", header: "状态", cell: (r) => (STATUS_LABEL[r.status] ?? r.status) + (r.errorCode ? `（${r.errorCode}）` : "") },
  ];
  const modelCols: DataColumn<Stats["byModel"][number]>[] = [
    { key: "model", header: "模型", cell: (r) => r.model },
    { key: "requests", header: "请求", cell: (r) => fmt(r.requests) },
    { key: "tokens", header: "输入 / 输出 tokens", cell: (r) => `${fmt(r.promptTokens)} / ${fmt(r.completionTokens)}` },
    { key: "charged", header: "费用", cell: (r) => usd(r.charged) },
  ];
  const tokenCols: DataColumn<Stats["byToken"][number]>[] = [
    { key: "name", header: "Key", cell: (r) => r.name || `#${r.tokenId}` },
    { key: "requests", header: "请求", cell: (r) => fmt(r.requests) },
    { key: "charged", header: "费用", cell: (r) => usd(r.charged) },
  ];

  const grid = (n: number): React.CSSProperties => ({ display: "grid", gridTemplateColumns: `repeat(${n}, minmax(0,1fr))`, gap: 12, margin: "12px 0" });
  const hint: React.CSSProperties = { fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 };

  return (
    <div>
      <PageHeader eyebrow="USAGE" title="用量与额度" description="你的余额、消费汇总与逐次调用明细。汇总按 UTC 日切。" />
      {error ? <p role="alert">{error}</p> : null}

      <div style={grid(3)}>
        <Card>
          <CardHeader><CardTitle>可用余额</CardTitle></CardHeader>
          <CardContent>{balance ? usd(balance.available) : "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>今日消费</CardTitle></CardHeader>
          <CardContent>
            {stats ? usd(stats.today.charged) : "—"}
            {stats ? <div style={hint}>{fmt(stats.today.requests)} 次请求 · {fmt(stats.today.promptTokens + stats.today.completionTokens)} tokens{stats.today.errors > 0 ? ` · ${stats.today.errors} 次失败` : ""}</div> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>近 {days} 天消费</CardTitle></CardHeader>
          <CardContent>
            {stats ? usd(stats.period.charged) : "—"}
            {stats ? <div style={hint}>{fmt(stats.period.requests)} 次请求 · 进行中占用 {balance ? usd(balance.reserved) : "—"}</div> : null}
          </CardContent>
        </Card>
      </div>

      <div style={{ display: "flex", gap: 6, margin: "12px 0" }}>
        {[7, 30, 90].map((n) => <Button key={n} variant={days === n ? "default" : "outline"} onClick={() => setDays(n)}>近 {n} 天</Button>)}
      </div>
      <div style={grid(2)}>
        <Card>
          <CardHeader><CardTitle>按模型</CardTitle></CardHeader>
          <CardContent><DataTable columns={modelCols} rows={stats?.byModel ?? []} rowKey={(r) => r.model} loading={!stats} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>按 Key</CardTitle></CardHeader>
          <CardContent><DataTable columns={tokenCols} rows={stats?.byToken ?? []} rowKey={(r) => r.tokenId} loading={!stats} /></CardContent>
        </Card>
      </div>

      <Card style={{ margin: "12px 0" }}>
        <CardHeader><CardTitle>调用明细</CardTitle></CardHeader>
        <CardContent>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 8 }}>
            <Field label="按模型筛选"><Input value={modelInput} onChange={(e) => setModelInput(e.target.value)} placeholder="模型名，精确匹配" /></Field>
            <Button variant="outline" onClick={() => { setPage(1); setModel(modelInput.trim()); }}>筛选</Button>
            {model ? <Button variant="ghost" onClick={() => { setModelInput(""); setModel(""); setPage(1); }}>清除</Button> : null}
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
