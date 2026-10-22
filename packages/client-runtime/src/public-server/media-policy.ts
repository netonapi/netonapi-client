/**
 * 媒体地址策略（infra-media §7.3、public-routes §8.1）：签名有效期的**唯一来源**是后端的部署配置。
 *
 * 网页服务启动时读后端的匿名接口 `GET /app/infra/media/policy`，按它的 `validitySeconds` 把会渲染媒体的缓存档位
 * 收紧到 `revalidate ≤ 有效期 / 2`（cacheProfile）。站点配置不再重复这个值：两处配置同一个数只会不一致
 * （C3 的 3600 对 600 告警就是这么来的）。有效期为 null（`public` 策略的稳定地址）时不收紧。
 *
 * 取到之前（启动后的头几秒、后端暂时连不上）按最短的受支持有效期收紧（PENDING_MEDIA_VALIDITY），按退避重试到成功为止。
 * 只有一种情况记错误：后端的有效期短于 60 秒——Next 的档位 stale 下限是 30 秒，页面缓存名存实亡。
 */
import { MIN_SUPPORTED_MEDIA_VALIDITY, setEffectiveMediaValidity } from "../public/cache-profiles";
import { publicBackendUrl } from "./backend";

/** `GET /app/infra/media/policy` 的数据（infra-media §7.3）。 */
export interface MediaPolicy {
  /** none / public / tencent-a…d / aliyun-a…c / hmac */
  strategy: string;
  /** 公开 HTML 里媒体地址的有效期（秒）；稳定地址（不过期）为 null */
  validitySeconds: number | null;
  bucketSeconds?: number | null;
  /** tencent / aliyun / none */
  imageParams?: string | null;
}

export type MediaPolicyProblem = { code: "VALIDITY_TOO_SHORT"; validitySeconds: number };

export interface MediaPolicyResolution {
  /** 运行期生效的有效期；null = 不过期 */
  validitySeconds: number | null;
  problems: MediaPolicyProblem[];
}

/** 后端策略 → 运行期有效期（纯函数）。 */
export function resolveMediaPolicy(policy: MediaPolicy): MediaPolicyResolution {
  const v = policy.validitySeconds;
  const validitySeconds = typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
  const problems: MediaPolicyProblem[] = validitySeconds !== null && validitySeconds < MIN_SUPPORTED_MEDIA_VALIDITY
    ? [{ code: "VALIDITY_TOO_SHORT", validitySeconds }]
    : [];
  return { validitySeconds, problems };
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
  baseUrl?: string;
  fetch?: typeof fetch;
  /** 第一次失败后的重试间隔（之后翻倍，上限 5 分钟） */
  retryMs?: number;
  log?: (level: "info" | "error", event: string, detail?: Record<string, unknown>) => void;
}

const defaultLog: NonNullable<MediaPolicyCheckOptions["log"]> = (level, event, detail) =>
  (level === "error" ? console.error : console.info)(`[site] ${event}`, detail ?? "");

/** 取一次策略并设置运行期有效期；返回结果。 */
export async function checkMediaPolicyOnce(options: MediaPolicyCheckOptions = {}): Promise<MediaPolicyResolution> {
  const log = options.log ?? defaultLog;
  const policy = await fetchMediaPolicy(options);
  const result = resolveMediaPolicy(policy);
  setEffectiveMediaValidity(result.validitySeconds);
  for (const problem of result.problems) log("error", "site.media.policy.invalid", { ...problem, strategy: policy.strategy });
  log("info", "site.media.policy.applied", { strategy: policy.strategy, validitySeconds: result.validitySeconds });
  return result;
}

/**
 * 启动时取后端策略（instrumentation 调用），失败按退避重试到成功为止；在那之前档位按「还不知道」收紧。返回停止函数。
 */
export function startMediaPolicyCheck(options: MediaPolicyCheckOptions = {}): () => void {
  const log = options.log ?? defaultLog;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let delay = options.retryMs ?? 5_000;
  const run = async () => {
    try {
      await checkMediaPolicyOnce({ ...options, log });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
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
