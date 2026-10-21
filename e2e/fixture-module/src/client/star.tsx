"use client";

import { apiFetch } from "@neton/application-client-runtime/client";
import { defineObjectStateLoader, useObjectState } from "@neton/application-client-runtime/public-state";

/**
 * 夹具的访问者状态（public-routes §9.4）：每个岛只要自己那一个 id，同一次提交里的全部 id 合并成一次
 * `POST /app/fixture/state`（模拟后端记下每次调用的 id 列表）。
 */
export const starLoader = defineObjectStateLoader<boolean>({
  id: "fixture.star",
  maxBatch: 50,
  fallback: false,
  async load(ids, { signal }) {
    const { starred } = await apiFetch<{ starred: string[] }>("/app/fixture/state", { method: "POST", body: JSON.stringify({ ids }), signal });
    return Object.fromEntries(starred.map((id) => [id, true]));
  },
});

export function Star({ id }: { id: string }) {
  const { value, status } = useObjectState(starLoader, id);
  return <span data-testid="star" data-id={id} data-status={status} data-starred={String(value)} />;
}
