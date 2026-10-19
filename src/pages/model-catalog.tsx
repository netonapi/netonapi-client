"use client";

import * as React from "react";
import { apiFetch } from "@neton/application-client-runtime/client";
import { useDescribeError } from "@neton/application-client-runtime/errors";
import { useT } from "@neton/application-client-runtime/i18n";
import { useQuery } from "@neton/application-client-runtime/client-context";
import { DataTable, PageHeader, type DataColumn } from "@neton/application-client-kit";

interface PublicModel {
  model: string;
  inputPrice: string; outputPrice: string; cacheReadPrice: string;
  perRequestPrice?: number | null;
  defaultMaxOutputTokens?: number | null;
  capabilities?: string[];
}

/** 模型广场。未登录也能看——这是拉新入口，只暴露模型名与价格。 */
export default function Page() {
  const describeError = useDescribeError("gateway");
  const t = useT("gateway");
  // 能力名 → 词条 models.cap.<name>；未知能力原样显示
  const capLabel = (c: string) => (t.has(`models.cap.${c}`) ? t(`models.cap.${c}`) : c);
  // useQuery 而不是 effect 里取数：工作区切回页签会重挂 effect，那样每次切换都整页重拉、表格先清空
  const query = useQuery({ queryKey: ["gateway-models"], queryFn: () => apiFetch<PublicModel[]>("/app/gateway/model/list") });
  const rows = query.data ?? [];
  const loading = query.isLoading;
  const error = query.error ? describeError(query.error) : null;

  const columns: DataColumn<PublicModel>[] = [
    { key: "model", header: t("models.col.model"), cell: (r) => r.model },
    { key: "capabilities", header: t("models.col.capabilities"), cell: (r) => (r.capabilities ?? []).map(capLabel).join(" / ") || "—" },
    {
      key: "inputPrice", header: t("models.col.input_price"),
      cell: (r) => (r.perRequestPrice != null ? "—" : `$${r.inputPrice}`),
    },
    {
      key: "outputPrice", header: t("models.col.output_price"),
      cell: (r) => (r.perRequestPrice != null ? "—" : `$${r.outputPrice}`),
    },
    {
      key: "perRequestPrice", header: t("models.col.per_request"),
      cell: (r) => (r.perRequestPrice != null ? `$${(r.perRequestPrice / 1_000_000).toFixed(4)}` : "—"),
    },
    {
      // 未配默认上限的模型要求请求自带 max_tokens，否则会被拒绝——这里如实告知
      key: "defaultMaxOutputTokens", header: t("models.col.default_max_output"),
      cell: (r) => r.defaultMaxOutputTokens ?? t("models.requires_max_tokens"),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="MODELS"
        title={t("models.title")}
        description={t("models.description")}
      />
      {error ? <p role="alert">{error}</p> : null}
      <DataTable columns={columns} rows={rows} loading={loading} rowKey={(r) => r.model} />
    </div>
  );
}
