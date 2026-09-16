"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-client-runtime/client";
import { formatDateTime } from "@neton/application-client-runtime/types";
import {
  Button, DataTable, Drawer, Field, Input, PageHeader, RowActions, StatusBadge,
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

/** 表单里预算用美元、有效期用日期；提交时换算成后端的 μUSD 与毫秒时间戳。 */
interface TokenForm { name: string; budgetUsd: string; expiresOn: string; allowedModels: string; allowedIps: string }
const EMPTY_FORM: TokenForm = { name: "", budgetUsd: "", expiresOn: "", allowedModels: "", allowedIps: "" };

const usd = (micro: number) => `$${(micro / 1_000_000).toFixed(4)}`;

function toForm(t: MyToken): TokenForm {
  return {
    name: t.name,
    budgetUsd: t.quotaBudget != null ? String(t.quotaBudget / 1_000_000) : "",
    expiresOn: t.expiresAt ? new Date(t.expiresAt).toISOString().slice(0, 10) : "",
    allowedModels: t.allowedModels ?? "",
    allowedIps: t.allowedIps ?? "",
  };
}

/** 表单 → 请求体；返回错误文案或 null。 */
function toBody(f: TokenForm): { body: Record<string, unknown>; error: string | null } {
  const body: Record<string, unknown> = { name: f.name.trim(), allowedModels: f.allowedModels.trim(), allowedIps: f.allowedIps.trim() };
  if (!body.name) return { body, error: "请填写名称" };
  if (f.budgetUsd.trim()) {
    const v = Number(f.budgetUsd);
    if (!Number.isFinite(v) || v <= 0) return { body, error: "预算必须是大于 0 的美元数" };
    body.quotaBudget = Math.round(v * 1_000_000);
  }
  if (f.expiresOn.trim()) {
    // 取当天 23:59:59（本地时区）：用户填「到 6 月 30 日」的意思是那天还能用
    const t = new Date(`${f.expiresOn}T23:59:59`).getTime();
    if (!Number.isFinite(t)) return { body, error: "有效期格式不对" };
    if (t <= Date.now()) return { body, error: "有效期必须在今天之后" };
    body.expiresAt = t;
  }
  return { body, error: null };
}

/**
 * 接入说明。地址来自后端的公开信息接口（运维配 NEWGATE_PUBLIC_API_URL），不从浏览器地址栏猜：
 * 控制台与网关不一定同域。没配就把占位符原样摆出来并让用户去问管理员，别编一个假地址。
 */
function IntegrationCard({ info, sampleKey }: { info: PublicInfo | null; sampleKey: string }) {
  const base = info?.apiBase ?? "https://<网关地址>";
  const pre: React.CSSProperties = { fontSize: 12, margin: "4px 0 10px", padding: 10, borderRadius: 6, overflowX: "auto", background: "var(--muted, rgba(127,127,127,0.12))" };
  return (
    <div style={{ margin: "12px 0", padding: 12, border: "1px solid var(--border, currentColor)", borderRadius: 8 }}>
      <p style={{ margin: "0 0 6px", fontWeight: 600 }}>接入方式</p>
      {info && !info.apiBase ? (
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--muted-foreground)" }}>管理员尚未配置对外地址，请向管理员索取网关地址后替换下面的占位符。</p>
      ) : null}
      <p style={{ margin: "6px 0 2px", fontSize: 13 }}>OpenAI SDK：把 base_url 指向本网关，其余不变</p>
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
          可用端点：{info.endpoints.map((e) => e.path).join("、")}。Gemini 客户端把 API 地址指向 {base} 即可。
        </p>
      ) : null}
    </div>
  );
}

/** 我的 API Key。明文只在创建后展示一次——服务端只存哈希，之后谁也取不回。 */
export default function Page() {
  const [rows, setRows] = React.useState<MyToken[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<{ id: number | null; form: TokenForm } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [issued, setIssued] = React.useState<IssuedToken | null>(null);
  const [info, setInfo] = React.useState<PublicInfo | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setRows(await apiFetch<MyToken[]>("/app/gateway/token/list"));
    } catch (cause) { setError((cause as Error).message); } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    let alive = true;
    apiFetch<PublicInfo>("/app/gateway/public-info").then((i) => { if (alive) setInfo(i); }).catch(() => { /* 接入说明缺失不影响管理 Key */ });
    return () => { alive = false; };
  }, []);

  async function submit() {
    if (!editing) return;
    const { body, error: e } = toBody(editing.form);
    if (e) { setError(e); return; }
    setError(null); setBusy(true);
    try {
      if (editing.id == null) {
        setIssued(await apiWrite<IssuedToken>("/app/gateway/token/create", "POST", body));
      } else {
        await apiWrite("/app/gateway/token/update", "PUT", { id: editing.id, ...body });
      }
      setEditing(null); void load();
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }

  async function setStatus(row: MyToken, status: number) {
    setError(null);
    try {
      await apiWrite(`/app/gateway/token/update-status?id=${row.id}&status=${status}`, "PUT", {});
      void load();
    } catch (cause) { setError((cause as Error).message); }
  }

  async function remove(row: MyToken) {
    if (!window.confirm(`删除 Key「${row.name}」？正在使用它的程序会立即收到 401，且不可恢复。`)) return;
    setError(null);
    try {
      await apiWrite(`/app/gateway/token/delete/${row.id}`, "DELETE", {});
      void load();
    } catch (cause) { setError((cause as Error).message); }
  }

  const actions = (row: MyToken): RowAction[] => [
    { label: "编辑", onClick: () => { setError(null); setEditing({ id: row.id, form: toForm(row) }); } },
    row.status === 1
      ? { label: "停用", onClick: () => void setStatus(row, 0) }
      : { label: "启用", onClick: () => void setStatus(row, 1) },
    { label: "删除", onClick: () => void remove(row) },
  ];

  const expired = (r: MyToken) => r.expiresAt != null && r.expiresAt < Date.now();
  const limits = (r: MyToken) => {
    const parts: string[] = [];
    if (r.rpmLimit != null) parts.push(`RPM ${r.rpmLimit}`);
    if (r.tpmLimit != null) parts.push(`TPM ${r.tpmLimit}`);
    if (r.concurrencyLimit != null) parts.push(`并发 ${r.concurrencyLimit}`);
    return parts.length ? parts.join(" · ") : "不限";
  };

  const columns: DataColumn<MyToken>[] = [
    { key: "name", header: "名称", cell: (r) => r.name },
    { key: "display", header: "Key", cell: (r) => <code>{r.display}</code> },
    { key: "quota", header: "已用 / 预算", cell: (r) => `${usd(r.quotaUsed)} / ${r.quotaBudget != null ? usd(r.quotaBudget) : "不限"}` },
    { key: "models", header: "模型范围", cell: (r) => r.allowedModels ? r.allowedModels : "全部" },
    { key: "limits", header: "限速（运营设定）", cell: limits },
    { key: "expiresAt", header: "有效期", cell: (r) => (r.expiresAt ? formatDateTime(r.expiresAt) : "长期") },
    { key: "status", header: "状态", cell: (r) => <StatusBadge active={r.status === 1 && !expired(r)}>{expired(r) ? "已过期" : r.status === 1 ? "启用" : "停用"}</StatusBadge> },
    { key: "actions", header: "操作", cell: (row) => <RowActions primary={actions(row)} /> },
  ];

  const f = editing?.form ?? EMPTY_FORM;
  const setF = (patch: Partial<TokenForm>) => setEditing((cur) => (cur ? { ...cur, form: { ...cur.form, ...patch } } : cur));

  return (
    <div>
      <PageHeader
        eyebrow="API"
        title="我的 API Key"
        description="用这些 Key 调用网关。兼容 OpenAI、Anthropic、Gemini 三种客户端配置方式。"
      />
      {error ? <p role="alert">{error}</p> : null}
      <div style={{ margin: "12px 0" }}>
        <Button onClick={() => { setError(null); setEditing({ id: null, form: EMPTY_FORM }); }}>创建 Key</Button>
      </div>

      {issued ? (
        <div style={{ margin: "12px 0", padding: 12, border: "1px solid currentColor", borderRadius: 8 }}>
          <p><strong>请立即复制保存，这串明文不会再显示：</strong></p>
          <code style={{ wordBreak: "break-all" }}>{issued.key}</code>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <Button variant="secondary" onClick={() => { void navigator.clipboard?.writeText(issued.key); }}>复制</Button>
            <Button onClick={() => setIssued(null)}>我已保存</Button>
          </div>
        </div>
      ) : null}

      <DataTable columns={columns} rows={rows} loading={loading} rowKey={(r) => r.id} />

      <IntegrationCard info={info} sampleKey={issued?.key ?? "sk-你的Key"} />

      <Drawer open={editing !== null} onClose={() => setEditing(null)} title={editing?.id == null ? "创建 API Key" : "编辑 API Key"}>
        <Field label="名称"><Input value={f.name} onChange={(e) => setF({ name: e.target.value })} placeholder="例如 生产环境 / 本地调试" /></Field>
        <Field label="预算（美元，留空则不限，仍受账户余额约束）">
          <Input value={f.budgetUsd} onChange={(e) => setF({ budgetUsd: e.target.value })} placeholder="例如 20" inputMode="decimal" />
        </Field>
        <Field label="有效期（留空则长期有效）">
          <Input type="date" value={f.expiresOn} onChange={(e) => setF({ expiresOn: e.target.value })} />
        </Field>
        <Field label="允许的模型（逗号分隔，留空则全部）">
          <Input value={f.allowedModels} onChange={(e) => setF({ allowedModels: e.target.value })} placeholder="gpt-4o,claude-sonnet-4" />
        </Field>
        <Field label="允许的来源 IP（逗号分隔，留空则不限）">
          <Input value={f.allowedIps} onChange={(e) => setF({ allowedIps: e.target.value })} placeholder="1.2.3.4,10.0.0.0/8" />
        </Field>
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--muted-foreground)" }}>
          RPM / TPM / 并发上限由平台设定，如需调整请联系管理员。
        </p>
        <div style={{ marginTop: 12 }}>
          <Button onClick={() => void submit()} disabled={busy}>{busy ? "保存中…" : editing?.id == null ? "创建" : "保存"}</Button>
        </div>
      </Drawer>
    </div>
  );
}
