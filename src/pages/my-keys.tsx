"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-client-runtime/client";
import { useDescribeError } from "@neton/application-client-runtime/errors";
import { useFormat, useT, type Translate } from "@neton/application-client-runtime/i18n";
import { useQuery, useQueryClient } from "@neton/application-client-runtime/client-context";
import { formatDateTime } from "@neton/application-client-runtime/types";
import {
  Alert, Button, Checkbox, DataTable, Drawer, Field, Input, PageHeader, RowActions, StatusBadge,
  type DataColumn, type RowAction,
} from "@neton/application-client-kit";

interface MyToken {
  id: number; name: string; display: string;
  quotaBudget?: number | null; quotaUsed: number; expiresAt?: number | null;
  allowedModels: string; allowedIps: string;
  rpmLimit?: number | null; tpmLimit?: number | null; concurrencyLimit?: number | null;
  status: number; createdAt?: number | null;
}

interface IssuedToken { id: number; key: string; display: string }
interface PublicInfo { apiBase?: string | null; endpoints: { path: string; protocol: string; capability: string }[] }

/** 有效期预设；编辑时多一个「保持不变」。天数按「从现在起」算，到期那天的 23:59:59 失效。 */
const EXPIRY_PRESETS = [
  { key: "7", label: "keys.expiry.7d", days: 7 },
  { key: "30", label: "keys.expiry.30d", days: 30 },
  { key: "180", label: "keys.expiry.180d", days: 180 },
  { key: "365", label: "keys.expiry.365d", days: 365 },
  { key: "never", label: "keys.expiry.never", days: null },
] as const;
type ExpiryChoice = "keep" | (typeof EXPIRY_PRESETS)[number]["key"];

/** 表单里预算用美元、有效期用预设、模型用勾选；提交时换算成后端的 μUSD、毫秒时间戳与逗号串。 */
interface TokenForm {
  name: string; budgetUsd: string; expiry: ExpiryChoice; keepExpiresAt: number | null;
  modelMode: "all" | "specific"; models: string[]; allowedIps: string;
}
const EMPTY_FORM: TokenForm = { name: "", budgetUsd: "", expiry: "never", keepExpiresAt: null, modelMode: "all", models: [], allowedIps: "" };

const usd = (micro: number) => `$${(micro / 1_000_000).toFixed(4)}`;
const splitList = (v: string | null | undefined) => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

function toForm(t: MyToken): TokenForm {
  return {
    name: t.name,
    budgetUsd: t.quotaBudget != null ? String(t.quotaBudget / 1_000_000) : "",
    expiry: t.expiresAt ? "keep" : "never",
    keepExpiresAt: t.expiresAt ?? null,
    modelMode: splitList(t.allowedModels).length ? "specific" : "all",
    models: splitList(t.allowedModels),
    allowedIps: t.allowedIps ?? "",
  };
}

function endOfDayAfter(days: number): number {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 0);
  return d.getTime();
}

/** 表单 → 请求体；返回错误文案或 null。 */
function toBody(f: TokenForm, t: Translate): { body: Record<string, unknown>; error: string | null } {
  const allowedModels = f.modelMode === "all" ? "" : f.models.join(",");
  const body: Record<string, unknown> = { name: f.name.trim(), allowedModels, allowedIps: f.allowedIps.trim() };
  if (!body.name) return { body, error: t("keys.err.name_required") };
  if (f.modelMode === "specific" && f.models.length === 0) return { body, error: t("keys.err.models_required") };
  if (f.budgetUsd.trim()) {
    const v = Number(f.budgetUsd);
    if (!Number.isFinite(v) || v <= 0) return { body, error: t("keys.err.budget_invalid") };
    body.quotaBudget = Math.round(v * 1_000_000);
  }
  // 后端更新是整体覆盖：不传 expiresAt 等于清掉有效期，所以「保持不变」要把原值带回去
  if (f.expiry === "keep") {
    if (f.keepExpiresAt != null && f.keepExpiresAt <= Date.now()) return { body, error: t("keys.err.expired") };
    if (f.keepExpiresAt != null) body.expiresAt = f.keepExpiresAt;
  } else {
    const preset = EXPIRY_PRESETS.find((p) => p.key === f.expiry);
    if (preset?.days != null) body.expiresAt = endOfDayAfter(preset.days);
  }
  return { body, error: null };
}

const chipClass = (on: boolean) =>
  `rounded-md border px-3 py-1.5 text-xs font-medium transition ${on
    ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
    : "border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)]"}`;

/**
 * 模型范围：「全部模型」不限制；「指定模型」时勾选。目录里没有、但 Key 上已存的值（旧数据、
 * 已下架的模型）照样列出来并保持勾选 —— 静默丢掉会让一次「只改名称」的保存悄悄放宽权限。
 */
function ModelPicker({ catalog, mode, onMode, value, onChange }: {
  catalog: string[]; mode: "all" | "specific"; onMode: (m: "all" | "specific") => void; value: string[]; onChange: (v: string[]) => void;
}) {
  const t = useT("gateway");
  const [query, setQuery] = React.useState("");
  const all = React.useMemo(() => [...new Set([...value.filter((m) => !catalog.includes(m)), ...catalog])], [catalog, value]);
  const shown = all.filter((m) => m.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (m: string) => onChange(value.includes(m) ? value.filter((x) => x !== m) : [...value, m]);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={chipClass(mode === "all")} onClick={() => onMode("all")}>{t("keys.models.all")}</button>
        <button type="button" className={chipClass(mode === "specific")} onClick={() => onMode("specific")}>
          {mode === "specific" && value.length ? t("keys.models.specific_count", { count: value.length }) : t("keys.models.specific")}
        </button>
      </div>
      {mode === "specific" ? (
        <div className="rounded-lg border border-[var(--border)]">
          <div className="border-b border-[var(--border)] p-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("keys.models.search")} />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {shown.length === 0 ? <div className="px-2 py-3 text-xs text-[var(--muted-foreground)]">{t("keys.models.no_match")}</div> : null}
            {shown.map((m) => (
              <label key={m} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--muted)]">
                <Checkbox checked={value.includes(m)} onCheckedChange={() => toggle(m)} />
                <span className="truncate">{m}</span>
                {!catalog.includes(m) ? <span className="ml-auto text-[10px] text-[var(--muted-foreground)]">{t("keys.models.not_in_catalog")}</span> : null}
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 接入说明。地址来自后端的公开信息接口（运维配 NETONAPI_PUBLIC_API_URL），不从浏览器地址栏猜：
 * 控制台与网关不一定同域。没配就把占位符原样摆出来并让用户去问管理员，别编一个假地址。
 */
function IntegrationCard({ info, sampleKey }: { info: PublicInfo | null; sampleKey: string }) {
  const t = useT("gateway");
  const base = info?.apiBase ?? `https://<${t("keys.integration.host_placeholder")}>`;
  const pre: React.CSSProperties = { fontSize: 12, margin: "4px 0 10px", padding: 10, borderRadius: 6, overflowX: "auto", background: "var(--muted, rgba(127,127,127,0.12))" };
  return (
    <div style={{ padding: 12, border: "1px solid var(--border, currentColor)", borderRadius: 8 }}>
      <p style={{ margin: "0 0 6px", fontWeight: 600 }}>{t("keys.integration.title")}</p>
      {info && !info.apiBase ? (
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--muted-foreground)" }}>{t("keys.integration.no_base")}</p>
      ) : null}
      <p style={{ margin: "6px 0 2px", fontSize: 13 }}>{t("keys.integration.openai")}</p>
      <pre style={pre}>{`from openai import OpenAI
client = OpenAI(base_url="${base}/v1", api_key="${sampleKey}")`}</pre>
      <p style={{ margin: "6px 0 2px", fontSize: 13 }}>Anthropic SDK</p>
      <pre style={pre}>{`from anthropic import Anthropic
client = Anthropic(base_url="${base}", api_key="${sampleKey}")`}</pre>
      <p style={{ margin: "6px 0 2px", fontSize: 13 }}>curl</p>
      <pre style={pre}>{`curl ${base}/v1/chat/completions \\
  -H "Authorization: Bearer ${sampleKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "hi"}]}'`}</pre>
      {info ? (
        <p style={{ margin: 0, fontSize: 12, color: "var(--muted-foreground)" }}>
          {t("keys.integration.endpoints", { endpoints: info.endpoints.map((e) => e.path).join(t("keys.integration.sep")), base })}
        </p>
      ) : null}
    </div>
  );
}

/** 我的 API Key。明文只在创建后展示一次——服务端只存哈希，之后谁也取不回。 */
export default function Page() {
  const describeError = useDescribeError("gateway");
  const t = useT("gateway");
  const format = useFormat();
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<{ id: number | null; form: TokenForm } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [issued, setIssued] = React.useState<IssuedToken | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [advanced, setAdvanced] = React.useState(false);

  // useQuery 而不是 effect 里取数：工作区切回页签会重挂 effect，那样每次切换都整页重拉、表格先清空
  const client = useQueryClient();
  const tokensQ = useQuery({ queryKey: ["gateway-my-tokens"], queryFn: () => apiFetch<MyToken[]>("/app/gateway/token/list") });
  // 接入说明与模型目录拉不到不影响管理 Key：前者显示占位符，后者只能选「全部模型」
  const infoQ = useQuery({ queryKey: ["gateway-public-info"], queryFn: () => apiFetch<PublicInfo>("/app/gateway/public-info") });
  const catalogQ = useQuery({ queryKey: ["gateway-models"], queryFn: () => apiFetch<{ model: string }[]>("/app/gateway/model/list") });
  const rows = tokensQ.data ?? [];
  const loading = tokensQ.isLoading;
  const info = infoQ.data ?? null;
  const catalog = React.useMemo(() => (catalogQ.data ?? []).map((x) => x.model), [catalogQ.data]);
  const listError = tokensQ.error ? describeError(tokensQ.error) : null;
  const load = () => client.invalidateQueries({ queryKey: ["gateway-my-tokens"] });

  async function submit() {
    if (!editing) return;
    const { body, error: e } = toBody(editing.form, t);
    if (e) { setFormError(e); return; }
    setFormError(null); setBusy(true);
    try {
      if (editing.id == null) {
        setIssued(await apiWrite<IssuedToken>("/app/gateway/token/create", "POST", body));
      } else {
        await apiWrite("/app/gateway/token/update", "PUT", { id: editing.id, ...body });
      }
      setEditing(null); void load();
    } catch (cause) { setFormError(describeError(cause)); } finally { setBusy(false); }
  }

  async function setStatus(row: MyToken, status: number) {
    setError(null);
    try {
      await apiWrite(`/app/gateway/token/update-status?id=${row.id}&status=${status}`, "PUT", {});
      void load();
    } catch (cause) { setError(describeError(cause)); }
  }

  async function remove(row: MyToken) {
    if (!window.confirm(t("keys.confirm_delete", { name: row.name }))) return;
    setError(null);
    try {
      await apiWrite(`/app/gateway/token/delete/${row.id}`, "DELETE", {});
      void load();
    } catch (cause) { setError(describeError(cause)); }
  }

  const actions = (row: MyToken): RowAction[] => [
    { label: t("keys.action.edit"), onClick: () => openEditor(row.id, toForm(row)) },
    row.status === 1
      ? { label: t("keys.action.disable"), onClick: () => void setStatus(row, 0) }
      : { label: t("keys.action.enable"), onClick: () => void setStatus(row, 1) },
    { label: t("keys.action.delete"), onClick: () => void remove(row) },
  ];

  function openEditor(id: number | null, form: TokenForm) {
    setFormError(null);
    setAdvanced(Boolean(form.allowedIps.trim()));
    setEditing({ id, form });
  }

  const expired = (r: MyToken) => r.expiresAt != null && r.expiresAt < Date.now();
  const limits = (r: MyToken) => {
    const parts: string[] = [];
    if (r.rpmLimit != null) parts.push(`RPM ${r.rpmLimit}`);
    if (r.tpmLimit != null) parts.push(`TPM ${r.tpmLimit}`);
    if (r.concurrencyLimit != null) parts.push(t("keys.limit.concurrency", { n: r.concurrencyLimit }));
    return parts.length ? parts.join(" · ") : t("keys.unlimited");
  };

  const columns: DataColumn<MyToken>[] = [
    { key: "name", header: t("keys.col.name"), cell: (r) => r.name },
    { key: "display", header: "Key", cell: (r) => <code>{r.display}</code> },
    { key: "quota", header: t("keys.col.quota"), cell: (r) => `${usd(r.quotaUsed)} / ${r.quotaBudget != null ? usd(r.quotaBudget) : t("keys.unlimited")}` },
    { key: "models", header: t("keys.col.models"), cell: (r) => r.allowedModels ? r.allowedModels : t("keys.models.all_short") },
    { key: "limits", header: t("keys.col.limits"), cell: limits },
    { key: "expiresAt", header: t("keys.col.expires"), cell: (r) => (r.expiresAt ? formatDateTime(r.expiresAt) : t("keys.no_expiry")) },
    { key: "status", header: t("keys.col.status"), cell: (r) => <StatusBadge active={r.status === 1 && !expired(r)}>{expired(r) ? t("keys.status.expired") : r.status === 1 ? t("keys.status.enabled") : t("keys.status.disabled")}</StatusBadge> },
    { key: "actions", header: t("keys.col.actions"), cell: (row) => <RowActions primary={actions(row)} /> },
  ];

  const f = editing?.form ?? EMPTY_FORM;
  const setF = (patch: Partial<TokenForm>) => setEditing((cur) => (cur ? { ...cur, form: { ...cur.form, ...patch } } : cur));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="API"
        title={t("keys.title")}
        description={t("keys.description")}
      />
      {error ?? listError ? <Alert tone="error">{error ?? listError}</Alert> : null}
      <div>
        <Button onClick={() => openEditor(null, EMPTY_FORM)}>{t("keys.create")}</Button>
      </div>

      {issued ? (
        <div style={{ padding: 12, border: "1px solid currentColor", borderRadius: 8 }}>
          <p><strong>{t("keys.issued.notice")}</strong></p>
          <code style={{ wordBreak: "break-all" }}>{issued.key}</code>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <Button variant="secondary" onClick={() => { void navigator.clipboard?.writeText(issued.key); }}>{t("keys.issued.copy")}</Button>
            <Button onClick={() => setIssued(null)}>{t("keys.issued.saved")}</Button>
          </div>
        </div>
      ) : null}

      <DataTable columns={columns} rows={rows} loading={loading} rowKey={(r) => r.id} />

      <IntegrationCard info={info} sampleKey={issued?.key ?? `sk-${t("keys.integration.key_placeholder")}`} />

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id == null ? t("keys.drawer.create_title") : t("keys.drawer.edit_title")}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>{t("keys.drawer.cancel")}</Button>
            <Button onClick={() => void submit()} disabled={busy}>{busy ? t("keys.drawer.saving") : editing?.id == null ? t("keys.drawer.create") : t("keys.drawer.save")}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {formError ? <Alert tone="error">{formError}</Alert> : null}
          <Field label={t("keys.field.name")}><Input value={f.name} onChange={(e) => setF({ name: e.target.value })} placeholder={t("keys.field.name_placeholder")} autoFocus /></Field>
          <Field label={t("keys.field.expiry")}>
            <div className="flex flex-wrap gap-2">
              {editing?.id != null && f.keepExpiresAt != null ? (
                <button type="button" className={chipClass(f.expiry === "keep")} onClick={() => setF({ expiry: "keep" })}>
                  {t("keys.expiry.keep", { date: format.date(f.keepExpiresAt) })}
                </button>
              ) : null}
              {EXPIRY_PRESETS.map((p) => (
                <button key={p.key} type="button" className={chipClass(f.expiry === p.key)} onClick={() => setF({ expiry: p.key })}>{t(p.label)}</button>
              ))}
            </div>
          </Field>
          <Field label={t("keys.field.models")}><ModelPicker catalog={catalog} mode={f.modelMode} onMode={(modelMode) => setF({ modelMode })} value={f.models} onChange={(models) => setF({ models })} /></Field>
          <Field label={t("keys.field.budget")}>
            <Input value={f.budgetUsd} onChange={(e) => setF({ budgetUsd: e.target.value })} placeholder={t("keys.field.budget_placeholder")} inputMode="decimal" />
          </Field>
          <div>
            <button type="button" className="text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]" onClick={() => setAdvanced((v) => !v)}>
              {advanced ? t("keys.advanced.hide") : t("keys.advanced.show")}
            </button>
          </div>
          {advanced ? (
            <Field label={t("keys.field.allowed_ips")}>
              <Input value={f.allowedIps} onChange={(e) => setF({ allowedIps: e.target.value })} placeholder="1.2.3.4,10.0.0.0/8" />
            </Field>
          ) : null}
          <p className="text-xs text-[var(--muted-foreground)]">{t("keys.limits_note")}</p>
        </div>
      </Drawer>
    </div>
  );
}
