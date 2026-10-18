"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-client-runtime/client";
import { useMutation, usePermission, useQuery, useQueryClient } from "@neton/application-client-runtime/client-context";
import { useDescribeError } from "@neton/application-client-runtime/errors";
import type { PageResponse } from "@neton/application-client-runtime/types";
import { formatDateTime } from "@neton/application-client-runtime/types";
import {
  Button, ConfirmDialog, DataTable, Drawer, Field, FilterPanel, Input, PageHeader,
  Pagination, RowActions, Select, StatusBadge, Textarea, type DataColumn, type RowAction,
} from "@neton/application-client-kit";

export type ResourceRecord = Record<string, unknown> & { id: number };
export type ResourceFieldType = "text" | "number" | "select" | "textarea";

export interface ResourceOption { label: string; value: string | number }
export interface ResourceField {
  key: string;
  label: string;
  type?: ResourceFieldType;
  placeholder?: string;
  required?: boolean;
  options?: ResourceOption[];
  defaultValue?: string | number;
  filter?: boolean;
  table?: boolean;
  /** 默认可编辑；date 格式和 id 默认只读。 */
  editable?: boolean;
  format?: "status" | "date" | "money" | "mono";
}

export interface ResourcePageConfig {
  resourceKey: string;
  eyebrow: string;
  title: string;
  description: string;
  endpoint: string;
  /** 默认 page；也支持 list/list-all/page-all 等真实后端路径。 */
  listPath?: string;
  permissions: { page: string; query?: string; create?: string; update?: string; delete?: string };
  fields: ResourceField[];
  readOnly?: boolean;
  /** 详情抽屉字段；存在时列表提供“详情”操作并调用 get/{id}。 */
  detailFields?: ResourceField[];
  /** 默认 get/{id}；用于 get-detail?id=... 等非标准详情接口。 */
  detailPath?: (record: ResourceRecord) => string;
  pageSize?: number;
  initialFilters?: Record<string, string>;
  rowActions?: (record: ResourceRecord) => { primary?: RowAction[]; more?: RowAction[] };
  mapSave?: (record: ResourceRecord) => Record<string, unknown>;
  /** 模块专属的轻量页头动作，例如全部标记已读。 */
  headerActions?: React.ReactNode;
  /** 模块 id：错误按该模块语言包的 `error.<CODE>` 翻译（缺省只用通用错误说明）。 */
  namespace?: string;
}

function valueOf(value: unknown): string | number {
  if (typeof value === "number" || typeof value === "string") return value;
  return "";
}

function makeEmpty(fields: ResourceField[]): ResourceRecord {
  return Object.fromEntries([["id", 0], ...fields.map((field) => [field.key, field.defaultValue ?? ""])]) as ResourceRecord;
}

function renderCell(field: ResourceField, row: ResourceRecord) {
  const value = row[field.key];
  if (field.format === "status") return <StatusBadge active={Number(value) === 1}>{Number(value) === 1 ? "启用" : "停用"}</StatusBadge>;
  if (field.format === "date") return formatDateTime(value as string | number | null);
  if (field.format === "money") return <span className="tabular-nums">¥{(Number(value ?? 0) / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
  if (field.format === "mono") return <code className="text-xs">{String(value ?? "-")}</code>;
  return value === null || value === undefined || value === "" ? <span className="text-[var(--muted-foreground)]">-</span> : String(value);
}

export function ResourcePage({ config }: { config: ResourcePageConfig }) {
  const queryClient = useQueryClient();
  const canCreate = usePermission(config.permissions.create);
  const canUpdate = usePermission(config.permissions.update);
  const canDelete = usePermission(config.permissions.delete);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(config.pageSize ?? 20);
  const filterFields = config.fields.filter((field) => field.filter);
  const [draft, setDraft] = React.useState<Record<string, string>>(() => Object.fromEntries(filterFields.map((field) => [field.key, config.initialFilters?.[field.key] ?? ""])));
  const [filters, setFilters] = React.useState(draft);
  const [form, setForm] = React.useState<ResourceRecord | null>(null);
  const [deleting, setDeleting] = React.useState<ResourceRecord | null>(null);
  const [viewing, setViewing] = React.useState<ResourceRecord | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const describeError = useDescribeError(config.namespace);

  const params = new URLSearchParams({ pageNo: String(page), pageSize: String(pageSize) });
  Object.entries(filters).forEach(([key, value]) => value !== "" && params.set(key, value));
  const query = useQuery({
    queryKey: [config.resourceKey, page, pageSize, filters],
    queryFn: async () => {
      const data = await apiFetch<PageResponse<ResourceRecord> | ResourceRecord[]>(`/admin${config.endpoint}/${config.listPath ?? "page"}?${params}`);
      return Array.isArray(data) ? { list: data, total: data.length, page: 1, size: data.length, totalPages: 1 } : data;
    },
  });

  const save = useMutation({
    mutationFn: (record: ResourceRecord) => {
      const editable = config.fields.filter((field) => !field.filter && field.editable !== false && field.format !== "date" && field.key !== "id");
      const safeRecord = Object.fromEntries([
        ...(record.id ? [["id", record.id]] : []),
        ...editable.map((field) => [field.key, record[field.key]]),
      ]) as ResourceRecord;
      const body = config.mapSave ? config.mapSave(safeRecord) : safeRecord;
      return apiWrite<void>(`/admin${config.endpoint}/${record.id ? "update" : "create"}`, record.id ? "PUT" : "POST", body);
    },
    onSuccess: async () => { setForm(null); await queryClient.invalidateQueries({ queryKey: [config.resourceKey] }); },
    onError: (cause: Error) => setError(describeError(cause)),
  });
  const remove = useMutation({
    mutationFn: (record: ResourceRecord) => apiWrite<void>(`/admin${config.endpoint}/delete/${record.id}`, "DELETE"),
    onSuccess: async () => { setDeleting(null); await queryClient.invalidateQueries({ queryKey: [config.resourceKey] }); },
  });

  const tableFields = config.fields.filter((field) => field.table !== false && !field.filter);
  const columns: DataColumn<ResourceRecord>[] = [
    ...tableFields.map((field): DataColumn<ResourceRecord> => ({ key: field.key, header: field.label, cell: (row) => renderCell(field, row) })),
    ...((Boolean(config.detailFields) || Boolean(config.rowActions) || (!config.readOnly && (canUpdate || canDelete))) ? [{
      key: "actions", header: "操作", headerClassName: "text-right", className: "text-right",
      cell: (row: ResourceRecord) => <RowActions primary={[
        ...(config.rowActions?.(row).primary ?? []),
        ...(config.detailFields ? [{ label: "详情", onClick: async () => { setDetailLoading(true); setError(null); try { setViewing(await apiFetch<ResourceRecord>(`/admin${config.endpoint}/${config.detailPath?.(row) ?? `get/${row.id}`}`)); } catch (cause) { setError(describeError(cause)); setViewing(row); } finally { setDetailLoading(false); } } }] : []),
        ...(!config.readOnly && canUpdate ? [{ label: "编辑", tone: "primary" as const, onClick: () => { setError(null); setForm({ ...row }); } }] : []),
      ]} more={[...(config.rowActions?.(row).more ?? []), ...(!config.readOnly && canDelete ? [{ label: "删除", danger: true, onClick: () => setDeleting(row) }] : [])]} />,
    } satisfies DataColumn<ResourceRecord>] : []),
  ];

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    const missing = config.fields.find((field) => field.required && String(form[field.key] ?? "").trim() === "");
    if (missing) { setError(`请填写${missing.label}`); return; }
    setError(null);
    save.mutate(form);
  }

  return <div className="space-y-4">
    <PageHeader eyebrow={config.eyebrow} title={config.title} description={config.description} actions={<>
      {config.headerActions}
      {!config.readOnly && canCreate && <Button onClick={() => { setError(null); setForm(makeEmpty(config.fields)); }}>新增</Button>}
      <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>刷新</Button>
    </>} />
    {filterFields.length > 0 && <FilterPanel onSubmit={(event) => { event.preventDefault(); setPage(1); setFilters({ ...draft }); }}>
      <div className="flex flex-wrap items-end gap-3">
        {filterFields.map((field) => <div key={field.key} className="min-w-48 flex-1"><Field label={field.label}>
          {field.type === "select" ? <Select value={draft[field.key]} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}><option value="">全部</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select> : <Input value={draft[field.key]} placeholder={field.placeholder} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })} />}
        </Field></div>)}
        <Button type="button" variant="ghost" onClick={() => { const next = Object.fromEntries(filterFields.map((field) => [field.key, ""])); setDraft(next); setFilters(next); setPage(1); }}>重置</Button>
        <Button type="submit">查询</Button>
      </div>
    </FilterPanel>}
    <section className="front-surface overflow-hidden rounded-xl">
      <DataTable columns={columns} rows={query.data?.list ?? []} rowKey={(row) => row.id} loading={query.isPending} error={query.error ? describeError(query.error) : undefined} />
      <Pagination page={page} pageSize={pageSize} total={query.data?.total ?? 0} loading={query.isFetching} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
    </section>
    <Drawer open={Boolean(form)} onClose={() => setForm(null)} title={`${form?.id ? "编辑" : "新增"}${config.title}`} footer={<><Button variant="ghost" onClick={() => setForm(null)}>取消</Button><Button type="submit" form={`${config.resourceKey}-form`} disabled={save.isPending}>保存</Button></>}>
      {form && <form id={`${config.resourceKey}-form`} className="space-y-4" onSubmit={submit}>
        {error && <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</div>}
        {config.fields.filter((field) => !field.filter && field.editable !== false && field.format !== "date" && field.key !== "id").map((field) => <Field key={field.key} label={field.label}>
          {field.type === "select" ? <Select value={valueOf(form[field.key])} onChange={(event) => setForm({ ...form, [field.key]: Number.isNaN(Number(event.target.value)) ? event.target.value : Number(event.target.value) })}>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select>
            : field.type === "textarea" ? <Textarea value={String(form[field.key] ?? "")} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} />
            : <Input type={field.type === "number" ? "number" : "text"} value={valueOf(form[field.key])} placeholder={field.placeholder} onChange={(event) => setForm({ ...form, [field.key]: field.type === "number" ? Number(event.target.value) : event.target.value })} />}
        </Field>)}
      </form>}
    </Drawer>
    <Drawer open={Boolean(viewing)} onClose={() => setViewing(null)} title={`${config.title}详情`} description={detailLoading ? "正在加载详情…" : `记录 ID ${viewing?.id ?? ""}`} widthClassName="max-w-2xl">
      {viewing && <dl className="overflow-hidden rounded-xl border border-[var(--border)]">{(config.detailFields ?? []).map((field) => <div key={field.key} className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 border-b border-[var(--border)] p-3 last:border-0"><dt className="text-xs font-semibold text-[var(--muted-foreground)]">{field.label}</dt><dd className="break-all text-sm text-[var(--foreground)]">{renderCell(field, viewing)}</dd></div>)}</dl>}
    </Drawer>
    <ConfirmDialog open={Boolean(deleting)} title={`删除${config.title}`} description="删除后不可恢复，请确认该数据未被其他业务引用。" confirmLabel="确认删除" pending={remove.isPending} onCancel={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting)} />
  </div>;
}
