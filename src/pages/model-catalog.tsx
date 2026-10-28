"use client";

import * as React from "react";
import { apiFetch } from "@neton/application-client-runtime/client";
import { useDescribeError } from "@neton/application-client-runtime/errors";
import { useT } from "@neton/application-client-runtime/i18n";
import { useQuery } from "@neton/application-client-runtime/client-context";
import { DataTable, PageHeader, type DataColumn } from "@neton/application-client-kit";

interface PriceItems { input: string; output: string; cacheRead: string; cacheWrite: string; perRequest?: number | null }
interface Row {
  model: string; displayName?: string | null; official: PriceItems; price: PriceItems; discountBp?: number | null;
  source: string; mode?: string | null; tiered: boolean; defaultMaxOutputTokens?: number | null;
}
interface Group { groupCode: string; groupName: string; groupRatio: string; rows: Row[] }
interface PublicModel { model: string; capabilities?: string[] }

/**
 * 我的模型与价格：读自己的价目表（`/app/gateway/pricebook/mine`，与转发同一个查价口径）——
 * 每个模型的官方价、你的价格、相当于官方价几折；约定价（用户 / 分组）标「协议价」。
 * Key 分在不同计费分组时按分组分别列出。
 */
export default function Page() {
  const describeError = useDescribeError("gateway");
  const t = useT("gateway");
  const capLabel = (c: string) => (t.has(`models.cap.${c}`) ? t(`models.cap.${c}`) : c);
  // useQuery 而不是 effect 里取数：工作区切回页签会重挂 effect，那样每次切换都整页重拉、表格先清空
  const query = useQuery({ queryKey: ["gateway-pricebook-mine"], queryFn: () => apiFetch<Group[]>("/app/gateway/pricebook/mine") });
  // 能力（chat / embeddings）取自公开目录；拉不到只是少一列信息
  const capsQ = useQuery({ queryKey: ["gateway-models"], queryFn: () => apiFetch<PublicModel[]>("/app/gateway/model/list").catch(() => [] as PublicModel[]) });
  const caps = React.useMemo(() => new Map((capsQ.data ?? []).map((m) => [m.model, m.capabilities ?? []])), [capsQ.data]);
  const groups = query.data ?? [];
  const error = query.error ? describeError(query.error) : null;

  const pair = (p: PriceItems) => (p.perRequest != null ? t("models.per_request_price", { price: (p.perRequest / 1e6).toFixed(4) }) : `$${p.input} / $${p.output}`);
  const discount = (bp?: number | null) => {
    if (bp == null) return "—";
    const scale = Number(t("models.discount_scale")) || 1000;
    return bp >= 10000 ? t("models.times_official", { x: String(Number((bp / 10000).toFixed(2))) }) : t("models.of_official", { x: String(Number((bp / scale).toFixed(2))) });
  };

  const columns: DataColumn<Row>[] = [
    { key: "model", header: t("models.col.model"), cell: (r) => <div>
      {r.displayName ? <><div className="font-medium">{r.displayName}</div><code className="text-[11px] text-[var(--muted-foreground)]">{r.model}</code></> : r.model}
      {r.source !== "PLATFORM" ? <span className="ml-1 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">{t("models.agreed")}</span> : null}
    </div> },
    { key: "capabilities", header: t("models.col.capabilities"), cell: (r) => (caps.get(r.model) ?? []).map(capLabel).join(" / ") || "—" },
    { key: "official", header: t("models.col.official"), cell: (r) => <span className="tabular-nums text-[var(--muted-foreground)]">{pair(r.official)}</span> },
    { key: "price", header: t("models.col.your_price"), cell: (r) => <span className="tabular-nums font-medium">{pair(r.price)}{r.tiered ? <div className="text-[11px] font-normal text-[var(--muted-foreground)]">{t("models.tiered_note")}</div> : null}</span> },
    { key: "discount", header: t("models.col.discount"), cell: (r) => discount(r.discountBp) },
    // 未配默认上限的模型要求请求自带 max_tokens，否则会被拒绝——这里如实告知
    { key: "defaultMaxOutputTokens", header: t("models.col.default_max_output"), cell: (r) => r.defaultMaxOutputTokens ?? t("models.requires_max_tokens") },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="MODELS" title={t("models.title")} description={t("models.description")} />
      {error ? <p role="alert">{error}</p> : null}
      {query.isLoading ? <DataTable columns={columns} rows={[]} loading rowKey={(r) => r.model} /> : null}
      {groups.map((g) => (
        <div key={g.groupCode} className="flex flex-col gap-2">
          {groups.length > 1 ? <h2 className="text-sm font-semibold">{t("models.group_title", { name: g.groupName })}</h2> : null}
          <DataTable columns={columns} rows={g.rows} loading={false} rowKey={(r) => r.model} />
        </div>
      ))}
    </div>
  );
}
