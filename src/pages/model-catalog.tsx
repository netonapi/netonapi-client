"use client";

import * as React from "react";
import { apiFetch } from "@neton/application-client-runtime/client";
import { useQuery } from "@neton/application-client-runtime/client-context";
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
  // useQuery 而不是 effect 里取数：工作区切回页签会重挂 effect，那样每次切换都整页重拉、表格先清空
  const query = useQuery({ queryKey: ["gateway-models"], queryFn: () => apiFetch<PublicModel[]>("/app/gateway/model/list") });
  const rows = query.data ?? [];
  const loading = query.isLoading;
  const error = query.error ? (query.error as Error).message : null;

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
    <div className="flex flex-col gap-4">
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
