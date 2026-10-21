/**
 * 运行期的媒体地址策略交叉校验（infra-media §7.3、public-routes §8.1）。
 *
 * 构建期 `resolveSite()` 已经按站点配置 `media.signedUrlValiditySeconds` 校验了缓存档位；但签名有效期的
 * 真源是后端的部署配置。网页服务启动时读后端的匿名接口 `GET /app/infra/media/policy`，两边不一致就记错误
 * 日志，并**以较短者为准**：会渲染媒体的档位在运行期收紧到 `revalidate ≤ 有效期 / 2`（cacheProfile）。
 *
 * 后端暂时连不上时不阻塞启动：按退避重试，直到拿到一次策略为止；在那之前按站点配置运行。
 */
import { effectiveMediaValidity, setEffectiveMediaValidity } from "../public/cache-profiles";
import { publicBackendUrl } from "./backend";

/** `GET /app/infra/media/policy` 的数据（infra-media §7.3）。 */
export interface MediaPolicy {
  /** none / public / tencent-a…d / aliyun-a…c / hmac */
  strategy: string;
  /** 地址有效期（秒）；稳定地址（不过期）为 null */
  validitySeconds: number | null;
  bucketSeconds?: number | null;
  /** tencent / aliyun / none */
  imageParams?: string | null;
}

export type MediaPolicyProblem =
  | { code: "SITE_VALIDITY_MISSING"; backend: number }
  | { code: "VALIDITY_MISMATCH"; site: number; backend: number }
  | { code: "SITE_EXPECTS_SIGNED"; site: number }
  | { code: "VALIDITY_TOO_SHORT"; effective: number };

export interface MediaPolicyReconciliation {
  /** 运行期生效的有效期（两者中较短的；都没有 = 不过期） */
  effective: number | undefined;
  problems: MediaPolicyProblem[];
}

/** 档位的 stale 下限是 30 秒（Next 预渲染规则）：有效期短于 60 秒时 revalidate 只能低于 stale，页面缓存名存实亡。 */
const MIN_SUPPORTED_VALIDITY = 60;

function positive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** 站点配置与后端策略对账（纯函数）。 */
export function reconcileMediaPolicy(siteValidity: number | undefined, policy: MediaPolicy): MediaPolicyReconciliation {
  const backend = positive(policy.validitySeconds);
  const problems: MediaPolicyProblem[] = [];
  if (backend !== undefined && siteValidity === undefined) problems.push({ code: "SITE_VALIDITY_MISSING", backend });
  else if (backend !== undefined && siteValidity !== undefined && backend !== siteValidity) problems.push({ code: "VALIDITY_MISMATCH", site: siteValidity, backend });
  else if (backend === undefined && siteValidity !== undefined) problems.push({ code: "SITE_EXPECTS_SIGNED", site: siteValidity });
  const candidates = [siteValidity, backend].filter((v): v is number => v !== undefined);
  const effective = candidates.length ? Math.min(...candidates) : undefined;
  if (effective !== undefined && effective < MIN_SUPPORTED_VALIDITY) problems.push({ code: "VALIDITY_TOO_SHORT", effective });
  return { effective, problems };
}

export function parseMediaPolicy(data: unknown): MediaPolicy | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.strategy !== "string" || !d.strategy) return null;
  const validity = d.validitySeconds;
  if (validity !== null && validity !== undefined && typeof validity !== "number") return null;
  return {
    strategy: d.strategy,
    validitySeconds: (validity as number | null | undefined) ?? null,
    bucketSeconds: typeof d.bucketSeconds === "number" ? d.bucketSeconds : null,
    imageParams: typeof d.imageParams === "string" ? d.imageParams : null,
  };
}

export async function fetchMediaPolicy(options: { baseUrl?: string; fetch?: typeof fetch } = {}): Promise<MediaPolicy> {
  const base = (options.baseUrl ?? publicBackendUrl()).replace(/\/+$/, "");
  const res = await (options.fetch ?? fetch)(`${base}/app/infra/media/policy`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as { code?: number; message?: string; data?: unknown } | null;
  if (!body || body.code !== 0) throw new Error(body?.message || `HTTP ${res.status}`);
  const policy = parseMediaPolicy(body.data);
  if (!policy) throw new Error("INVALID_RESPONSE");
  return policy;
}

export interface MediaPolicyCheckOptions {
  /** 站点配置的 `media.signedUrlValiditySeconds` */
  siteValidity: number | undefined;
  baseUrl?: string;
  fetch?: typeof fetch;
  /** 第一次失败后的重试间隔（之后翻倍，上限 5 分钟） */
  retryMs?: number;
  log?: (level: "info" | "error", event: string, detail?: Record<string, unknown>) => void;
}

const defaultLog: NonNullable<MediaPolicyCheckOptions["log"]> = (level, event, detail) =>
  (level === "error" ? console.error : console.info)(`[site] ${event}`, detail ?? "");

/** 校验一次并设置运行期有效期；返回对账结果。 */
export async function checkMediaPolicyOnce(options: MediaPolicyCheckOptions): Promise<MediaPolicyReconciliation> {
  const log = options.log ?? defaultLog;
  const policy = await fetchMediaPolicy(options);
  const result = reconcileMediaPolicy(options.siteValidity, policy);
  setEffectiveMediaValidity(result.effective);
  for (const problem of result.problems) log("error", "site.media.policy.mismatch", { ...problem, strategy: policy.strategy });
  if (!result.problems.length) log("info", "site.media.policy.ok", { strategy: policy.strategy, validitySeconds: result.effective ?? null });
  return result;
}

/**
 * 启动时的交叉校验（instrumentation 调用）：先按站点配置生效，再在后台取后端策略，失败按退避重试到成功为止。
 * 返回停止函数。
 */
export function startMediaPolicyCheck(options: MediaPolicyCheckOptions): () => void {
  const log = options.log ?? defaultLog;
  if (effectiveMediaValidity() === undefined && options.siteValidity !== undefined) setEffectiveMediaValidity(options.siteValidity);
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let delay = options.retryMs ?? 5_000;
  const run = async () => {
    try {
      await checkMediaPolicyOnce({ ...options, log });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 后端没有这个接口（infra 版本较旧）：按站点配置运行，不再重试
      if (message === "ROUTE_NOT_FOUND") { log("info", "site.media.policy.unavailable"); return; }
      log("info", "site.media.policy.retry", { message, inMs: delay });
    }
    if (stopped) return;
    timer = setTimeout(run, delay);
    timer.unref?.();
    delay = Math.min(delay * 2, 5 * 60_000);
  };
  void run();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
