"use client";

import * as React from "react";
import { apiFetch } from "@neton/application-client-runtime/client";
import {
  Card, CardContent, CardHeader, CardTitle,
  DataTable, PageHeader, Pagination, type DataColumn,
} from "@neton/application-client-kit";

interface Balance { balance: number; reserved: number; available: number }
interface UsageLog {
  id: number; requestModel: string; promptTokens: number; completionTokens: number;
  charged: number; status: string; stream: number; createdAt?: number | null;
}
interface PageResp<T> { list: T[]; total: number; page: number; size: number; totalPages: number }

/** 额度 μUSD（1e-6 USD）转成美元展示，避免用户对着 7 位整数猜。 */
function usd(micro: number): string {
  return `$${(micro / 1_000_000).toFixed(4)}`;
}

export default function Page() {
  const [balance, setBalance] = React.useState<Balance | null>(null);
  const [rows, setRows] = React.useState<UsageLog[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const size = 20;

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [b, p] = await Promise.all([
        apiFetch<Balance>("/app/gateway/usage/balance"),
        apiFetch<PageResp<UsageLog>>(`/app/gateway/usage/log/page?pageNo=${page}&pageSize=${size}`),
      ]);
      setBalance(b); setRows(p.list); setTotal(p.total);
    } catch (cause) { setError((cause as Error).message); } finally { setLoading(false); }
  }, [page]);

  React.useEffect(() => { void load(); }, [load]);

  const columns: DataColumn<UsageLog>[] = [
    { key: "requestModel", header: "模型", cell: (r) => r.requestModel },
    { key: "promptTokens", header: "输入", cell: (r) => r.promptTokens },
    { key: "completionTokens", header: "输出", cell: (r) => r.completionTokens },
    { key: "charged", header: "费用", cell: (r) => usd(r.charged) },
    { key: "stream", header: "流式", cell: (r) => (r.stream === 1 ? "是" : "否") },
    { key: "status", header: "状态", cell: (r) => r.status },
  ];

  return (
    <div>
      <PageHeader eyebrow="USAGE" title="用量与额度" description="你的余额、在途占用与逐次调用明细。" />
      {error ? <p role="alert">{error}</p> : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 12, margin: "12px 0" }}>
        <Card>
          <CardHeader><CardTitle>可用余额</CardTitle></CardHeader>
          <CardContent>{balance ? usd(balance.available) : "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>账面余额</CardTitle></CardHeader>
          <CardContent>{balance ? usd(balance.balance) : "—"}</CardContent>
        </Card>
        <Card>
          {/* 预留是进行中请求的资金占位，请求结束后按实际用量结算并退还差额 */}
          <CardHeader><CardTitle>进行中占用</CardTitle></CardHeader>
          <CardContent>{balance ? usd(balance.reserved) : "—"}</CardContent>
        </Card>
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
    </div>
  );
}
