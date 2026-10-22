/**
 * 「失效目标就绪」信号（site-module §6.0，产品决定 2）：网页服务启动时、以及与后端的连接从故障中恢复时，调后端
 * `POST /platform/site/target/ready`（签名同失效端点：payload = 原始请求体），后端立即把积压的失效投递重新排到现在
 * 并清零退避，下一个投递节拍（≤ 250 ms）就按顺序合并补投——网页服务重启后不必等退避（最长 60 秒）才追上。
 *
 * - 请求体 `{}` = 全部失效目标；多实例部署可设 `NETON_SITE_REVALIDATE_TARGET`（后端 `[revalidate] targets` 里
 *   本实例那一项的原样地址）只唤醒自己。
 * - 启动时按 1、2、5、10、30、60 秒退避重试直到成功（后端可能比网页服务后起）。后端没装 site 模块
 *   （ROUTE_NOT_FOUND）或没配密钥（SITE_SYNC_DISABLED）时记一次日志后停止：那里没有积压可言。
 * - 信号是幂等的：多发一次只是让后端多试投一次。
 */
import { publicBackendUrl } from "./backend";
import { SIGNATURE_HEADER, signatureHeader } from "./signature";

const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000, 60_000];
const STOP_CODES = new Set(["ROUTE_NOT_FOUND", "SITE_SYNC_DISABLED", "SITE_TARGET_UNKNOWN"]);

export interface SiteReadyOptions {
  secret: string;
  baseUrl?: string;
  /** 只唤醒这一个失效目标（后端配置里的原样地址）；缺省全部。 */
  target?: string | null;
  fetch?: typeof fetch;
  log?: (event: string, detail?: Record<string, unknown>) => void;
  /** 测试注入：重试间隔。 */
  retryMs?: readonly number[];
}

export type SiteReadyResult = { ok: true; rescheduled: number } | { ok: false; code: string; stop: boolean };

/** 发一次就绪信号。 */
export async function announceSiteReady(options: SiteReadyOptions): Promise<SiteReadyResult> {
  const base = (options.baseUrl ?? publicBackendUrl()).replace(/\/+$/, "");
  const target = options.target === undefined ? process.env.NETON_SITE_REVALIDATE_TARGET?.trim() || null : options.target;
  const body = JSON.stringify(target ? { target } : {});
  try {
    const res = await (options.fetch ?? fetch)(`${base}/platform/site/target/ready`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", [SIGNATURE_HEADER]: signatureHeader(options.secret, body) },
      body,
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as { code?: number; message?: string; data?: { rescheduled?: number } } | null;
    if (json?.code === 0) return { ok: true, rescheduled: json.data?.rescheduled ?? 0 };
    const code = json?.message || `HTTP_${res.status}`;
    return { ok: false, code, stop: STOP_CODES.has(code) };
  } catch (error) {
    return { ok: false, code: error instanceof Error ? error.name : "NETWORK_ERROR", stop: false };
  }
}

/**
 * 发就绪信号直到成功（或遇到不该重试的回应）。返回取消函数。启动时调一次；连接恢复时（如已删除集合的同步
 * 从失败转为成功）再调一次。
 */
export function signalSiteReady(options: SiteReadyOptions): () => void {
  const log = options.log ?? ((event, detail) => console.info(`[site] ${event}`, detail ?? ""));
  const delays = options.retryMs ?? RETRY_MS;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  const run = async () => {
    const result = await announceSiteReady(options);
    if (cancelled) return;
    if (result.ok) { log("site.ready.sent", { rescheduled: result.rescheduled }); return; }
    if (result.stop) { log("site.ready.unavailable", { code: result.code }); return; }
    const wait = delays[Math.min(attempt, delays.length - 1)]!;
    attempt += 1;
    if (attempt === 1 || attempt % 10 === 0) log("site.ready.retry", { code: result.code, attempt, waitMs: wait });
    timer = setTimeout(run, wait);
    timer.unref?.();
  };
  void run();
  return () => { cancelled = true; if (timer) clearTimeout(timer); };
}
