"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-client-runtime/client";
import {
  Button, DataTable, Drawer, Field, Input, PageHeader, RowActions, StatusBadge,
  type DataColumn, type RowAction,
} from "@neton/application-client-kit";

interface MyToken {
  id: number; name: string; display: string;
  quotaBudget?: number | null; quotaUsed: number;
  rpmLimit?: number | null; tpmLimit?: number | null; concurrencyLimit?: number | null;
  status: number; createdAt?: number | null;
}

interface IssuedToken { id: number; key: string; display: string }
interface PublicInfo { apiBase?: string | null; endpoints: { path: string; protocol: string; capability: string }[] }

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
  const [creating, setCreating] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", quotaBudget: "" });
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

  async function create() {
    setError(null);
    try {
      const body: Record<string, unknown> = { name: form.name };
      if (form.quotaBudget) body.quotaBudget = Number(form.quotaBudget);
      setIssued(await apiWrite<IssuedToken>("/app/gateway/token/create", "POST", body));
      setCreating(false); setForm({ name: "", quotaBudget: "" });
      void load();
    } catch (cause) { setError((cause as Error).message); }
  }

  async function setStatus(row: MyToken, status: number) {
    setError(null);
    try {
      await apiWrite(`/app/gateway/token/update-status?id=${row.id}&status=${status}`, "PUT", {});
      void load();
    } catch (cause) { setError((cause as Error).message); }
  }

  async function remove(row: MyToken) {
    setError(null);
    try {
      await apiWrite(`/app/gateway/token/delete/${row.id}`, "DELETE", {});
      void load();
    } catch (cause) { setError((cause as Error).message); }
  }

  const actions = (row: MyToken): RowAction[] => [
    row.status === 1
      ? { label: "停用", onClick: () => void setStatus(row, 0) }
      : { label: "启用", onClick: () => void setStatus(row, 1) },
    { label: "删除", onClick: () => void remove(row) },
  ];

  const columns: DataColumn<MyToken>[] = [
    { key: "name", header: "名称", cell: (r) => r.name },
    { key: "display", header: "Key", cell: (r) => r.display },
    { key: "quotaUsed", header: "已用 μUSD", cell: (r) => r.quotaUsed },
    { key: "quotaBudget", header: "预算", cell: (r) => r.quotaBudget ?? "不限" },
    { key: "rpmLimit", header: "RPM", cell: (r) => r.rpmLimit ?? "不限" },
    { key: "concurrencyLimit", header: "并发", cell: (r) => r.concurrencyLimit ?? "不限" },
    { key: "status", header: "状态", cell: (r) => <StatusBadge active={r.status === 1}>{r.status === 1 ? "启用" : "停用"}</StatusBadge> },
    { key: "actions", header: "操作", cell: (row) => <RowActions primary={actions(row)} /> },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="API"
        title="我的 API Key"
        description="用这些 Key 调用网关。兼容 OpenAI、Anthropic、Gemini 三种客户端配置方式。"
      />
      {error ? <p role="alert">{error}</p> : null}
      <div style={{ margin: "12px 0" }}>
        <Button onClick={() => setCreating(true)}>创建 Key</Button>
      </div>

      {issued ? (
        <div style={{ margin: "12px 0", padding: 12, border: "1px solid currentColor", borderRadius: 8 }}>
          <p><strong>请立即复制保存，这串明文不会再显示：</strong></p>
          <code style={{ wordBreak: "break-all" }}>{issued.key}</code>
          <div style={{ marginTop: 8 }}>
            <Button onClick={() => setIssued(null)}>我已保存</Button>
          </div>
        </div>
      ) : null}

      <DataTable columns={columns} rows={rows} loading={loading} rowKey={(r) => r.id} />

      <IntegrationCard info={info} sampleKey={issued?.key ?? "sk-你的Key"} />

      <Drawer open={creating} onClose={() => setCreating(false)} title="创建 API Key">
        <Field label="名称"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="预算 μUSD（留空则不限，仍受账户余额约束）">
          <Input value={form.quotaBudget} onChange={(e) => setForm({ ...form, quotaBudget: e.target.value })} />
        </Field>
        <div style={{ marginTop: 12 }}>
          <Button onClick={() => void create()}>创建</Button>
        </div>
      </Drawer>
    </div>
  );
}
