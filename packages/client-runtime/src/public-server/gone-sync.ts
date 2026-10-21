/**
 * 已删除集合的增量同步（public-routes §7.2、site-module §6）：
 * 启动时全量（since=0）、之后每 10 分钟按上次的 `now` 增量拉取
 * `GET /platform/site/gone?since=&cursor=&limit=1000`，签名串 = 路径与查询串。
 *
 * 后端没装 site 模块（ROUTE_NOT_FOUND）时只记一次日志、照常按周期重试——没有 site 模块就没有
 * 已删除台账，410 退化为 404，功能正确。
 */
import { goneStore, type GoneStore } from "./gone";
import { publicBackendUrl } from "./backend";
import { SIGNATURE_HEADER, signatureHeader } from "./signature";

export const GONE_SYNC_INTERVAL_MS = 10 * 60 * 1000;
const PAGE_LIMIT = 1000;
const MAX_PAGES = 1000;

interface GonePage { list: { url: string; goneAt: number }[]; nextCursor?: string | null; now: number }

export interface GoneSyncOptions {
  secret: string;
  baseUrl?: string;
  intervalMs?: number;
  store?: GoneStore;
  fetch?: typeof fetch;
  log?: (event: string, detail?: Record<string, unknown>) => void;
}

export async function syncGoneOnce(since: number, options: GoneSyncOptions): Promise<number> {
  const base = (options.baseUrl ?? publicBackendUrl()).replace(/\/+$/, "");
  const doFetch = options.fetch ?? fetch;
  const store = options.store ?? goneStore();
  let cursor: string | null | undefined;
  let now = since;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = new URLSearchParams({ since: String(since), limit: String(PAGE_LIMIT) });
    if (cursor) query.set("cursor", cursor);
    const pathAndQuery = `/platform/site/gone?${query}`;
    const res = await doFetch(`${base}${pathAndQuery}`, {
      headers: { Accept: "application/json", [SIGNATURE_HEADER]: signatureHeader(options.secret, pathAndQuery) },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as { code?: number; message?: string; data?: GonePage } | null;
    if (!body || body.code !== 0 || !body.data) throw new Error(body?.message || `HTTP ${res.status}`);
    await store.add(body.data.list.map((item) => item.url).filter((url) => url.startsWith("/")));
    now = body.data.now;
    cursor = body.data.nextCursor;
    if (!cursor) break;
  }
  return now;
}

/** 启动周期同步，返回停止函数。 */
export function startGoneSync(options: GoneSyncOptions): () => void {
  const log = options.log ?? ((event, detail) => console.info(`[site] ${event}`, detail ?? ""));
  let since = 0;
  let stopped = false;
  let reportedUnavailable = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    try {
      since = await syncGoneOnce(since, options);
      reportedUnavailable = false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "ROUTE_NOT_FOUND") {
        if (!reportedUnavailable) log("site.gone.sync.unavailable", { reason: "site module not installed" });
        reportedUnavailable = true;
      } else {
        log("site.gone.sync.failed", { message });
      }
    }
    if (!stopped) {
      timer = setTimeout(run, options.intervalMs ?? GONE_SYNC_INTERVAL_MS);
      timer.unref?.();
    }
  };
  void run();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
