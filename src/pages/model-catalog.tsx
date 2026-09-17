"use client";

import * as React from "react";
import { apiFetch } from "@neton/application-client-runtime/client";
import { DataTable, PageHeader, type DataColumn } from "@neton/application-client-kit";

interface PublicModel {
  model: string;
  inputPrice: string; outputPrice: string; cacheReadPrice: string;
  perRequestPrice?: number | null;
  defaultMaxOutputTokens?: number | null;
  capabilities?: string[];
}

const CAP_LABEL: Record<string, string> = { chat: "对话", embeddings: "向量", images: "图片", rerank: "重排序", audio: "音频" };

/** 模型广场。未登录也能看——这是拉新入口，只暴露模型名与价格。 */
export default function Page() {
  const [rows, setRows] = React.useState<PublicModel[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    void (async () => {
      setLoading(true); setError(null);
      try {
        setRows(await apiFetch<PublicModel[]>("/app/gateway/model/list"));
      } catch (cause) { setError((cause as Error).message); } finally { setLoading(false); }
    })();
  }, []);

  const columns: DataColumn<PublicModel>[] = [
    { key: "model", header: "模型", cell: (r) => r.model },
    { key: "capabilities", header: "能力", cell: (r) => (r.capabilities ?? []).map((c) => CAP_LABEL[c] ?? c).join(" / ") || "—" },
    {
      key: "inputPrice", header: "输入价 / 1M",
      cell: (r) => (r.perRequestPrice != null ? "—" : `$${r.inputPrice}`),
    },
    {
      key: "outputPrice", header: "输出价 / 1M",
      cell: (r) => (r.perRequestPrice != null ? "—" : `$${r.outputPrice}`),
    },
    {
      key: "perRequestPrice", header: "按次",
      cell: (r) => (r.perRequestPrice != null ? `$${(r.perRequestPrice / 1_000_000).toFixed(4)}` : "—"),
    },
    {
      // 未配默认上限的模型要求请求自带 max_tokens，否则会被拒绝——这里如实告知
      key: "defaultMaxOutputTokens", header: "默认输出上限",
      cell: (r) => r.defaultMaxOutputTokens ?? "需自带 max_tokens",
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="MODELS"
        title="模型与价格"
        description="当前可用的模型及其单价。价格以 USD / 1M tokens 计，按次计价的模型单独标注。"
      />
      {error ? <p role="alert">{error}</p> : null}
      <DataTable columns={columns} rows={rows} loading={loading} rowKey={(r) => r.model} />
    </div>
  );
}
